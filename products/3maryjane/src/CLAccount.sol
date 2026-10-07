// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAdapterRegistry} from "./interfaces/IAdapterRegistry.sol";
import {ICLAdapter} from "./interfaces/ICLAdapter.sol";
import {IRiskGuard} from "./interfaces/IRiskGuard.sol";
import {CLTypes} from "./types/CLTypes.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";
import {ReentrancyGuard} from "./libraries/ReentrancyGuard.sol";

/// @title CLAccount
/// @notice User-owned clearing account. Protocol positions are opened from this address.
/// @dev Adapters build execution plans; this account performs each call directly, preserving
///      custody and protocol position ownership at the account address. When a risk guard is
///      enabled, every protocol transition is validated after execution and before commit.
contract CLAccount is ReentrancyGuard {
    using SafeTransferLib for address;

    address public owner;
    IAdapterRegistry public immutable registry;
    IRiskGuard public riskGuard;
    bool public riskGuardEnabled;
    bool public paused;

    mapping(address adapter => bool authorized) public authorizedAdapter;
    mapping(address adapter => uint64 version) public authorizedAdapterVersion;
    mapping(address asset => bool allowed) public allowedAsset;
    mapping(address operator => bool authorized) public defensiveOperator;

    error Unauthorized();
    error ZeroAddress();
    error AccountPaused();
    error AdapterInactive();
    error AdapterNotAuthorized();
    error AdapterAuthorizationStale();
    error AdapterNotRiskCovered();
    error DefensiveOperatorNotAuthorized();
    error RiskGuardRequired();
    error TargetNotAllowed();
    error CallNotAllowed(address target, bytes4 selector);
    error AssetNotAllowed();
    error InsufficientNativeBalance();
    error RiskPolicyViolation(bytes32 reason);
    error ExternalCallFailed(uint256 index, address target, bytes reason);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PauseChanged(bool paused);
    event RiskGuardChanged(address indexed guard, bool enabled);
    event DefensiveOperatorChanged(address indexed operator, bool authorized);
    event AdapterAuthorizationChanged(address indexed adapter, bool authorized, uint64 registryVersion);
    event AssetPermissionChanged(address indexed asset, bool allowed);
    event Deposited(address indexed asset, address indexed from, uint256 amount);
    event Withdrawn(address indexed asset, address indexed to, uint256 amount);
    event AdapterExecuted(address indexed adapter, bytes32 indexed protocolId, uint256 callCount);
    event BatchExecuted(uint256 adapterActionCount, uint256 lowLevelCallCount);
    event DefensiveBatchExecuted(address indexed operator, uint256 adapterActionCount, uint256 lowLevelCallCount);
    event CallExecuted(address indexed adapter, uint256 indexed index, address indexed target, uint256 value, bytes4 selector);
    event RiskTransitionValidated(address indexed guard);

    constructor(address initialOwner, address registry_) {
        if (initialOwner == address(0) || registry_ == address(0)) revert ZeroAddress();
        owner = initialOwner;
        registry = IAdapterRegistry(registry_);
        allowedAsset[address(0)] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit AssetPermissionChanged(address(0), true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert AccountPaused();
        _;
    }

    receive() external payable {
        emit Deposited(address(0), msg.sender, msg.value);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPaused(bool state) external onlyOwner {
        paused = state;
        emit PauseChanged(state);
    }

    /// @notice Install or disable transaction-level portfolio risk enforcement.
    /// @dev Enabling a guard does not surrender ownership; the owner can replace/disable it.
    function setRiskGuard(address guard, bool enabled) external onlyOwner {
        if (enabled && guard == address(0)) revert ZeroAddress();
        riskGuard = IRiskGuard(guard);
        riskGuardEnabled = enabled;
        emit RiskGuardChanged(guard, enabled);
    }

    /// @notice Authorize a contract to submit strictly risk-reducing adapter batches.
    /// @dev Operators can never withdraw from CLAccount and every operator batch must pass
    ///      `validateRiskReduction` atomically after all protocol calls.
    function setDefensiveOperator(address operator, bool authorized) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        defensiveOperator[operator] = authorized;
        emit DefensiveOperatorChanged(operator, authorized);
    }

    function setAssetAllowed(address asset, bool allowed) external onlyOwner {
        allowedAsset[asset] = allowed;
        emit AssetPermissionChanged(asset, allowed);
    }

    function authorizeAdapter(address adapter, bool authorized) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        if (authorized && !registry.isAdapterActive(adapter)) revert AdapterInactive();
        uint64 version = authorized ? registry.adapterVersion(adapter) : 0;
        authorizedAdapter[adapter] = authorized;
        authorizedAdapterVersion[adapter] = version;
        emit AdapterAuthorizationChanged(adapter, authorized, version);
    }

    function depositToken(address asset, uint256 amount) external nonReentrant {
        if (!allowedAsset[asset] || asset == address(0)) revert AssetNotAllowed();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(asset, msg.sender, amount);
    }

    function withdraw(address asset, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        bytes memory beforeRisk = _captureRisk();

        if (asset == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert ExternalCallFailed(type(uint256).max, to, bytes("NATIVE_WITHDRAW_FAILED"));
        } else {
            asset.safeTransfer(to, amount);
        }

        _enforceRisk(beforeRisk);
        emit Withdrawn(asset, to, amount);
    }

    function execute(address adapter, bytes calldata action)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (bytes[] memory results)
    {
        bytes memory beforeRisk = _captureRisk();
        results = _executeAdapter(adapter, action, 0);
        _enforceRisk(beforeRisk);
    }

    /// @notice Execute multiple protocol actions atomically through the same CL account.
    /// @dev Any failed low-level call or post-trade risk violation reverts the complete batch.
    function executeBatch(CLTypes.AdapterAction[] calldata actions)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (bytes[][] memory results)
    {
        bytes memory beforeRisk = _captureRisk();
        uint256 lowLevelCalls;
        (results, lowLevelCalls) = _executeBatch(actions);
        _enforceRisk(beforeRisk);
        emit BatchExecuted(actions.length, lowLevelCalls);
    }

    /// @notice Delegated emergency/automation path. The final state must be strictly safer.
    /// @dev This intentionally uses a stronger condition than normal owner execution. A keeper or
    ///      automation contract cannot make a merely policy-compliant trade; it must reduce risk.
    function executeDefensiveBatch(CLTypes.AdapterAction[] calldata actions)
        external
        whenNotPaused
        nonReentrant
        returns (bytes[][] memory results)
    {
        if (!defensiveOperator[msg.sender]) revert DefensiveOperatorNotAuthorized();
        if (!riskGuardEnabled || address(riskGuard) == address(0)) revert RiskGuardRequired();

        bytes memory beforeRisk = riskGuard.capture(address(this));
        uint256 lowLevelCalls;
        (results, lowLevelCalls) = _executeBatch(actions);

        (bool ok, bytes32 reason) = riskGuard.validateRiskReduction(address(this), beforeRisk);
        if (!ok) revert RiskPolicyViolation(reason);
        emit DefensiveBatchExecuted(msg.sender, actions.length, lowLevelCalls);
    }

    function _executeBatch(CLTypes.AdapterAction[] calldata actions)
        internal
        returns (bytes[][] memory results, uint256 lowLevelCalls)
    {
        results = new bytes[][](actions.length);
        for (uint256 i; i < actions.length; ++i) {
            results[i] = _executeAdapter(actions[i].adapter, actions[i].action, lowLevelCalls);
            lowLevelCalls += results[i].length;
        }
    }

    function _executeAdapter(address adapter, bytes calldata action, uint256 globalOffset)
        internal
        returns (bytes[] memory results)
    {
        _validateAdapter(adapter);

        CLTypes.Execution[] memory calls = ICLAdapter(adapter).buildExecution(address(this), action);
        results = new bytes[](calls.length);

        for (uint256 i; i < calls.length; ++i) {
            CLTypes.Execution memory execution = calls[i];
            if (execution.target == address(0) || execution.target == address(this)) revert TargetNotAllowed();
            if (!registry.isTargetAllowed(adapter, execution.target)) revert TargetNotAllowed();

            bytes4 selector = _selector(execution.data);
            if (!registry.isCallAllowed(adapter, execution.target, selector)) {
                revert CallNotAllowed(execution.target, selector);
            }
            if (execution.value > address(this).balance) revert InsufficientNativeBalance();

            (bool ok, bytes memory result) = execution.target.call{value: execution.value}(execution.data);
            if (!ok) revert ExternalCallFailed(globalOffset + i, execution.target, result);
            results[i] = result;

            emit CallExecuted(adapter, globalOffset + i, execution.target, execution.value, selector);
        }

        emit AdapterExecuted(adapter, ICLAdapter(adapter).protocolId(), calls.length);
    }

    function _validateAdapter(address adapter) internal view {
        if (!registry.isAdapterActive(adapter)) revert AdapterInactive();
        if (!authorizedAdapter[adapter]) revert AdapterNotAuthorized();
        if (authorizedAdapterVersion[adapter] != registry.adapterVersion(adapter)) revert AdapterAuthorizationStale();
        if (riskGuardEnabled && !riskGuard.isAdapterCovered(address(this), adapter)) revert AdapterNotRiskCovered();
    }

    function _captureRisk() internal view returns (bytes memory) {
        if (!riskGuardEnabled) return bytes("");
        return riskGuard.capture(address(this));
    }

    function _enforceRisk(bytes memory beforeRisk) internal view {
        if (!riskGuardEnabled) return;
        (bool ok, bytes32 reason) = riskGuard.validateTransition(address(this), beforeRisk);
        if (!ok) revert RiskPolicyViolation(reason);
    }

    function _selector(bytes memory data) internal pure returns (bytes4 selector) {
        if (data.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(data, 32))
        }
    }
}
