// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLAccount} from "../src/CLAccount.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {HashedCreditVault} from "../src/hashed/HashedCreditVault.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";

interface VmDemoHashedClearing {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface IERC20Demo {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Opens and fully unwinds a small Hashed position through the real 3maryjane account.
/// @dev Leaves wallet/account Hashed balances, collateral and debt at their pre-run values.
///      Intended only as Monad testnet integration evidence.
contract DemoHashedClearingTestnet {
    VmDemoHashedClearing internal constant vm =
        VmDemoHashedClearing(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant COLLATERAL_AMOUNT = 1e18; // 1 hNVDA
    uint256 internal constant BORROW_AMOUNT = 25e6; // 25 hUSD

    struct DemoConfig {
        uint256 key;
        address signer;
        CLAccount account;
        AdapterRegistry registry;
        RiskPolicyManager policyManager;
        HashedCreditVault vault;
        address adapter;
        address hNVDA;
        address hUSD;
    }

    struct Snapshot {
        uint256 walletCollateral;
        uint256 accountLoose;
        uint256 locked;
        uint256 debt;
    }

    error WrongChain(uint256 chainId);
    error WrongOwner(address expected, address actual);
    error AdapterNotReady();
    error AdapterNotCovered();
    error InsufficientDemoCollateral(uint256 balance);
    error TokenTransferFailed();
    error RiskCheckFailed(bytes32 reason);
    error StateNotRestored();

    event DemoComplete(
        address indexed account,
        address indexed adapter,
        address indexed collateral,
        uint256 collateralAmount,
        uint256 borrowAmount
    );

    function run() external {
        if (block.chainid != 10143) revert WrongChain(block.chainid);

        DemoConfig memory config = _loadConfig();
        Snapshot memory beforeState = _preflight(config);

        _executeRoundTrip(config);
        _verifyRestored(config, beforeState);

        emit DemoComplete(
            address(config.account),
            config.adapter,
            config.hNVDA,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT
        );
    }

    function _loadConfig() internal returns (DemoConfig memory config) {
        config.key = vm.envUint("PRIVATE_KEY");
        config.signer = vm.addr(config.key);
        config.account = CLAccount(payable(vm.envAddress("CL_ACCOUNT")));
        config.registry = AdapterRegistry(vm.envAddress("CL_ADAPTER_REGISTRY"));
        config.policyManager = RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));
        config.vault = HashedCreditVault(vm.envAddress("HASHED_VAULT"));
        config.adapter = vm.envAddress("HASHED_ADAPTER");
        config.hNVDA = vm.envAddress("HASHED_NVDA");
        config.hUSD = vm.envAddress("HASHED_USD");
    }

    function _preflight(DemoConfig memory config) internal view returns (Snapshot memory beforeState) {
        address expectedOwner = config.account.owner();
        if (expectedOwner != config.signer) revert WrongOwner(expectedOwner, config.signer);

        if (!config.registry.isAdapterActive(config.adapter) || !config.account.authorizedAdapter(config.adapter)) {
            revert AdapterNotReady();
        }
        if (!config.policyManager.isAdapterCovered(address(config.account), config.adapter)) {
            revert AdapterNotCovered();
        }

        beforeState.walletCollateral = IERC20Demo(config.hNVDA).balanceOf(config.signer);
        beforeState.accountLoose = IERC20Demo(config.hNVDA).balanceOf(address(config.account));
        beforeState.locked = config.vault.collateralOf(address(config.account), config.hNVDA);
        beforeState.debt = config.vault.debtOf(address(config.account));

        if (beforeState.walletCollateral < COLLATERAL_AMOUNT) {
            revert InsufficientDemoCollateral(beforeState.walletCollateral);
        }
    }

    function _executeRoundTrip(DemoConfig memory config) internal {
        vm.startBroadcast(config.key);

        if (!IERC20Demo(config.hNVDA).transfer(address(config.account), COLLATERAL_AMOUNT)) {
            revert TokenTransferFailed();
        }

        config.account.execute(
            config.adapter,
            abi.encode(uint8(0), config.hNVDA, COLLATERAL_AMOUNT)
        ); // DEPOSIT

        config.account.execute(
            config.adapter,
            abi.encode(uint8(2), config.hUSD, BORROW_AMOUNT)
        ); // BORROW

        _requirePolicyPass(config);

        config.account.execute(
            config.adapter,
            abi.encode(uint8(3), config.hUSD, BORROW_AMOUNT)
        ); // REPAY

        config.account.execute(
            config.adapter,
            abi.encode(uint8(1), config.hNVDA, COLLATERAL_AMOUNT)
        ); // WITHDRAW

        config.account.withdraw(config.hNVDA, config.signer, COLLATERAL_AMOUNT);

        vm.stopBroadcast();
    }

    function _requirePolicyPass(DemoConfig memory config) internal view {
        (bool ok, bytes32 reason,,) = config.policyManager.check(address(config.account));
        if (!ok) revert RiskCheckFailed(reason);
    }

    function _verifyRestored(DemoConfig memory config, Snapshot memory beforeState) internal view {
        _requirePolicyPass(config);

        if (
            IERC20Demo(config.hNVDA).balanceOf(config.signer) != beforeState.walletCollateral
                || IERC20Demo(config.hNVDA).balanceOf(address(config.account)) != beforeState.accountLoose
                || config.vault.collateralOf(address(config.account), config.hNVDA) != beforeState.locked
                || config.vault.debtOf(address(config.account)) != beforeState.debt
        ) revert StateNotRestored();
    }
}
