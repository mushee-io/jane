// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../risk/RiskRegistry.sol";
import {RiskTypes} from "../types/RiskTypes.sol";
import {HashedUSD} from "./HashedUSD.sol";

interface IERC20Hashed {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title HashedCreditVault
/// @notice Stock-backed credit primitive for 3maryjane on Monad.
/// @dev Collateral pricing is sourced from the existing 3maryjane RiskRegistry.
contract HashedCreditVault {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint8 public constant DEBT_DECIMALS = 6;

    struct CollateralConfig {
        bool enabled;
        uint8 decimals;
        uint16 ltvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
    }

    struct AccountState {
        uint256 collateralUsdE18;
        uint256 borrowCapacityUsdE18;
        uint256 liquidationCapacityUsdE18;
        uint256 debtUsdE18;
        uint256 healthFactorE18;
    }

    address public owner;
    bool public paused;

    RiskRegistry public immutable registry;
    HashedUSD public immutable debtToken;

    address[] private _supportedAssets;
    mapping(address asset => bool) private _knownAsset;
    mapping(address asset => CollateralConfig config) public collateralConfig;
    mapping(address account => mapping(address asset => uint256 amount)) public collateralOf;
    mapping(address account => uint256 amount) public debtOf;

    uint256 private _locked = 1;

    error Unauthorized();
    error ZeroAddress();
    error Paused();
    error InvalidConfig();
    error UnsupportedCollateral(address asset);
    error ZeroAmount();
    error BorrowLimitExceeded(uint256 debtUsdE18, uint256 capacityUsdE18);
    error HealthyAccount();
    error TransferFailed();
    error Reentrancy();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PausedUpdated(bool paused);
    event CollateralConfigured(
        address indexed asset,
        uint8 decimals,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps
    );
    event Deposited(address indexed account, address indexed asset, uint256 amount);
    event Withdrawn(address indexed account, address indexed asset, uint256 amount);
    event Borrowed(address indexed account, uint256 amount);
    event Repaid(address indexed account, uint256 amount);
    event Liquidated(
        address indexed liquidator,
        address indexed account,
        address indexed collateralAsset,
        uint256 repaid,
        uint256 collateralSeized
    );

    constructor(address initialOwner, address registry_, address debtToken_) {
        if (initialOwner == address(0) || registry_ == address(0) || debtToken_ == address(0)) revert ZeroAddress();
        owner = initialOwner;
        registry = RiskRegistry(registry_);
        debtToken = HashedUSD(debtToken_);
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit PausedUpdated(nextPaused);
    }

    function setCollateralConfig(
        address asset,
        uint8 decimals_,
        uint16 ltvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        bool enabled
    ) external onlyOwner {
        if (asset == address(0)) revert ZeroAddress();
        if (
            ltvBps > liquidationThresholdBps || liquidationThresholdBps > BPS
                || liquidationBonusBps > 2_000
        ) revert InvalidConfig();

        if (enabled) {
            RiskTypes.AssetConfig memory riskConfig = registry.requireAssetConfig(asset);
            if (riskConfig.decimals != decimals_) revert InvalidConfig();
            if (!_knownAsset[asset]) {
                _knownAsset[asset] = true;
                _supportedAssets.push(asset);
            }
        }

        collateralConfig[asset] = CollateralConfig({
            enabled: enabled,
            decimals: decimals_,
            ltvBps: ltvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            liquidationBonusBps: liquidationBonusBps
        });

        emit CollateralConfigured(asset, decimals_, ltvBps, liquidationThresholdBps, liquidationBonusBps);
    }

    function supportedAssetCount() external view returns (uint256) {
        return _supportedAssets.length;
    }

    function supportedAssetAt(uint256 index) external view returns (address) {
        return _supportedAssets[index];
    }

    function deposit(address asset, uint256 amount) external whenNotPaused nonReentrant {
        CollateralConfig memory config = collateralConfig[asset];
        if (!config.enabled) revert UnsupportedCollateral(asset);
        if (amount == 0) revert ZeroAmount();

        _safeTransferFrom(asset, msg.sender, address(this), amount);
        collateralOf[msg.sender][asset] += amount;
        emit Deposited(msg.sender, asset, amount);
    }

    function withdraw(address asset, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 current = collateralOf[msg.sender][asset];
        if (current < amount) revert ZeroAmount();

        collateralOf[msg.sender][asset] = current - amount;
        _enforceBorrowLimit(msg.sender);
        _safeTransfer(asset, msg.sender, amount);
        emit Withdrawn(msg.sender, asset, amount);
    }

    function borrow(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        debtOf[msg.sender] += amount;
        _enforceBorrowLimit(msg.sender);
        debtToken.mint(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant returns (uint256 repaid) {
        uint256 debt = debtOf[msg.sender];
        if (amount == 0 || debt == 0) revert ZeroAmount();

        repaid = amount > debt ? debt : amount;
        _safeTransferFrom(address(debtToken), msg.sender, address(this), repaid);
        debtToken.burn(address(this), repaid);
        debtOf[msg.sender] = debt - repaid;
        emit Repaid(msg.sender, repaid);
    }

    function liquidate(address account, address collateralAsset, uint256 requestedRepay)
        external
        nonReentrant
        returns (uint256 repaid, uint256 collateralSeized)
    {
        if (requestedRepay == 0) revert ZeroAmount();
        if (healthFactorE18(account) >= WAD) revert HealthyAccount();

        (repaid, collateralSeized) = _liquidationQuote(account, collateralAsset, requestedRepay);

        _safeTransferFrom(address(debtToken), msg.sender, address(this), repaid);
        debtToken.burn(address(this), repaid);

        debtOf[account] -= repaid;
        collateralOf[account][collateralAsset] -= collateralSeized;
        _safeTransfer(collateralAsset, msg.sender, collateralSeized);

        emit Liquidated(msg.sender, account, collateralAsset, repaid, collateralSeized);
    }

    function accountState(address account) external view returns (AccountState memory state) {
        state.collateralUsdE18 = totalCollateralUsdE18(account);
        state.borrowCapacityUsdE18 = borrowCapacityUsdE18(account);
        state.liquidationCapacityUsdE18 = liquidationCapacityUsdE18(account);
        state.debtUsdE18 = debtUsdE18(account);
        state.healthFactorE18 = healthFactorE18(account);
    }

    function totalCollateralUsdE18(address account) public view returns (uint256 total) {
        for (uint256 i; i < _supportedAssets.length; ++i) {
            address asset = _supportedAssets[i];
            CollateralConfig memory config = collateralConfig[asset];
            uint256 amount = collateralOf[account][asset];
            if (config.enabled && amount != 0) {
                total += _valueUsdE18(asset, amount, config.decimals);
            }
        }
    }

    function borrowCapacityUsdE18(address account) public view returns (uint256 capacity) {
        for (uint256 i; i < _supportedAssets.length; ++i) {
            address asset = _supportedAssets[i];
            CollateralConfig memory config = collateralConfig[asset];
            uint256 amount = collateralOf[account][asset];
            if (config.enabled && amount != 0) {
                uint256 value = _valueUsdE18(asset, amount, config.decimals);
                capacity += (value * config.ltvBps) / BPS;
            }
        }
    }

    function liquidationCapacityUsdE18(address account) public view returns (uint256 capacity) {
        for (uint256 i; i < _supportedAssets.length; ++i) {
            address asset = _supportedAssets[i];
            CollateralConfig memory config = collateralConfig[asset];
            uint256 amount = collateralOf[account][asset];
            if (config.enabled && amount != 0) {
                uint256 value = _valueUsdE18(asset, amount, config.decimals);
                capacity += (value * config.liquidationThresholdBps) / BPS;
            }
        }
    }

    function debtUsdE18(address account) public view returns (uint256) {
        return _debtUsdE18(debtOf[account]);
    }

    function healthFactorE18(address account) public view returns (uint256) {
        uint256 debtUsd = debtUsdE18(account);
        if (debtUsd == 0) return type(uint256).max;
        return (liquidationCapacityUsdE18(account) * WAD) / debtUsd;
    }

    function _liquidationQuote(address account, address collateralAsset, uint256 requestedRepay)
        internal
        view
        returns (uint256 repaid, uint256 collateralSeized)
    {
        CollateralConfig memory config = collateralConfig[collateralAsset];
        if (!config.enabled) revert UnsupportedCollateral(collateralAsset);

        uint256 availableCollateral = collateralOf[account][collateralAsset];
        if (availableCollateral == 0) revert ZeroAmount();

        uint256 debt = debtOf[account];
        repaid = requestedRepay > debt ? debt : requestedRepay;

        uint256 collateralValueUsd = _valueUsdE18(collateralAsset, availableCollateral, config.decimals);
        uint256 maxRepayUsd = (collateralValueUsd * BPS) / (BPS + config.liquidationBonusBps);
        uint256 maxRepayRaw = _fromUsdE18(maxRepayUsd);
        if (repaid > maxRepayRaw) repaid = maxRepayRaw;
        if (repaid == 0) revert ZeroAmount();

        uint256 seizeUsd = (_debtUsdE18(repaid) * (BPS + config.liquidationBonusBps)) / BPS;
        collateralSeized =
            (seizeUsd * (10 ** uint256(config.decimals))) / registry.priceE18(collateralAsset);
        if (collateralSeized > availableCollateral) collateralSeized = availableCollateral;
    }

    function _enforceBorrowLimit(address account) internal view {
        uint256 debtUsd = debtUsdE18(account);
        uint256 capacity = borrowCapacityUsdE18(account);
        if (debtUsd > capacity) revert BorrowLimitExceeded(debtUsd, capacity);
    }

    function _valueUsdE18(address asset, uint256 amount, uint8 decimals_) internal view returns (uint256) {
        return (amount * registry.priceE18(asset)) / (10 ** uint256(decimals_));
    }

    function _debtUsdE18(uint256 rawDebt) internal pure returns (uint256) {
        return rawDebt * 10 ** uint256(18 - DEBT_DECIMALS);
    }

    function _fromUsdE18(uint256 usdE18) internal pure returns (uint256) {
        return usdE18 / (10 ** uint256(18 - DEBT_DECIMALS));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Hashed.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Hashed.transferFrom.selector, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
