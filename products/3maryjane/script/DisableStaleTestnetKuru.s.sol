// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmDisableStaleKuru {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice TESTNET ONLY. Removes a stale Kuru deployment from enforced portfolio-risk reads.
/// @dev The Kuru integration remains in the codebase. This only reflects the current Monad
///      testnet state where the configured MarginAccount address has no bytecode.
contract DisableStaleTestnetKuru {
    VmDisableStaleKuru internal constant vm =
        VmDisableStaleKuru(address(uint160(uint256(keccak256("hevm cheat code")))));

    event StaleTestnetKuruDisabled(
        address indexed account,
        address indexed kuruAdapter,
        address indexed perplAdapter,
        address walletBalanceAdapter
    );

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");

        AdapterRegistry registry = AdapterRegistry(vm.envAddress("ADAPTER_REGISTRY"));
        RiskPolicyManager policyManager = RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));

        address account = vm.envAddress("CL_ACCOUNT");
        address kuruAdapter = vm.envAddress("KURU_ADAPTER");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address walletAdapter = vm.envAddress("WALLET_BALANCE_ADAPTER");

        RiskTypes.Policy memory currentPolicy = policyManager.policy(account);

        address[] memory riskAdapters = new address[](2);
        riskAdapters[0] = perplAdapter;
        riskAdapters[1] = walletAdapter;

        vm.startBroadcast(key);

        policyManager.configure(account, currentPolicy, riskAdapters);
        registry.setAdapterActive(kuruAdapter, false);

        emit StaleTestnetKuruDisabled(account, kuruAdapter, perplAdapter, walletAdapter);

        vm.stopBroadcast();
    }
}
