// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {HashedCreditVault} from "../src/hashed/HashedCreditVault.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmConfigureHashed {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Registers Hashed with the deployed 3maryjane Monad testnet account and risk policy.
/// @dev Run only after DeployHashedTestnet.s.sol and pass the emitted addresses through env vars.
contract ConfigureHashedTestnet {
    VmConfigureHashed internal constant vm =
        VmConfigureHashed(address(uint160(uint256(keccak256("hevm cheat code")))));

    error WrongChain(uint256 chainId);

    event HashedConfigured(address indexed account, address indexed adapter, uint256 riskAdapterCount);

    function run() external {
        if (block.chainid != 10143) revert WrongChain(block.chainid);

        uint256 key = vm.envUint("PRIVATE_KEY");
        AdapterRegistry registry = AdapterRegistry(vm.envAddress("CL_ADAPTER_REGISTRY"));
        CLAccount account = CLAccount(payable(vm.envAddress("CL_ACCOUNT")));
        RiskPolicyManager policyManager = RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));

        address hashedAdapter = vm.envAddress("HASHED_ADAPTER");
        address hashedVault = vm.envAddress("HASHED_VAULT");
        address hUSD = vm.envAddress("HASHED_USD");
        address hNVDA = vm.envAddress("HASHED_NVDA");
        address hAAPL = vm.envAddress("HASHED_AAPL");

        vm.startBroadcast(key);

        registry.setAdapterActive(hashedAdapter, true);

        _allowApprove(registry, hashedAdapter, hNVDA);
        _allowApprove(registry, hashedAdapter, hAAPL);
        _allowApprove(registry, hashedAdapter, hUSD);

        registry.setTargetAllowed(hashedAdapter, hashedVault, true);
        registry.setSelectorEnforced(hashedAdapter, hashedVault, true);
        registry.setSelectorAllowed(hashedAdapter, hashedVault, HashedCreditVault.deposit.selector, true);
        registry.setSelectorAllowed(hashedAdapter, hashedVault, HashedCreditVault.withdraw.selector, true);
        registry.setSelectorAllowed(hashedAdapter, hashedVault, HashedCreditVault.borrow.selector, true);
        registry.setSelectorAllowed(hashedAdapter, hashedVault, HashedCreditVault.repay.selector, true);

        account.setAssetAllowed(hNVDA, true);
        account.setAssetAllowed(hAAPL, true);
        account.setAssetAllowed(hUSD, true);

        // Authorize only after all registry mutations so the stored adapter version is current.
        account.authorizeAdapter(hashedAdapter, true);

        RiskTypes.Policy memory currentPolicy = policyManager.policy(address(account));
        address[] memory currentAdapters = policyManager.adapters(address(account));
        address[] memory nextAdapters = _appendUnique(currentAdapters, hashedAdapter);
        policyManager.configure(address(account), currentPolicy, nextAdapters);

        emit HashedConfigured(address(account), hashedAdapter, nextAdapters.length);
        vm.stopBroadcast();
    }

    function _allowApprove(AdapterRegistry registry, address adapter, address token) internal {
        registry.setTargetAllowed(adapter, token, true);
        registry.setSelectorEnforced(adapter, token, true);
        registry.setSelectorAllowed(adapter, token, bytes4(keccak256("approve(address,uint256)")), true);
    }

    function _appendUnique(address[] memory adapters, address adapter)
        internal
        pure
        returns (address[] memory next)
    {
        for (uint256 i; i < adapters.length; ++i) {
            if (adapters[i] == adapter) return adapters;
        }

        next = new address[](adapters.length + 1);
        for (uint256 i; i < adapters.length; ++i) {
            next[i] = adapters[i];
        }
        next[adapters.length] = adapter;
    }
}
