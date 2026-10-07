// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLAccount} from "../src/CLAccount.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";

interface VmVerifyTestnet {
    function envAddress(string calldata) external returns (address);
    function envAddress(string calldata, string calldata) external returns (address[] memory);
}

/// @title VerifyTestnetDeployment
/// @notice Read-only verifier for the Monad testnet 3maryjane deployment.
/// @dev Testnet intentionally verifies Kuru + Perpl + WalletBalance only; Euler is mainnet-only.
contract VerifyTestnetDeployment {
    VmVerifyTestnet internal constant vm =
        VmVerifyTestnet(address(uint160(uint256(keccak256("hevm cheat code")))));

    error OwnerMismatch(address actual, address expected);
    error RiskGuardMismatch(address actual, address expected);
    error RiskGuardDisabled();
    error AdapterInactive(address adapter);
    error AdapterUnauthorized(address adapter);
    error AdapterAuthorizationStale(address adapter, uint64 accountVersion, uint64 registryVersion);
    error AdapterNotRiskCovered(address adapter);
    error DefensiveOperatorMissing(address operator);
    error AssetNotAllowed(address asset);

    event TestnetDeploymentVerified(
        address indexed account,
        address indexed owner,
        uint256 executableAdapters,
        uint256 riskSources
    );

    function run() external {
        address accountAddress = vm.envAddress("CL_ACCOUNT");
        _verifyAccount(accountAddress);
        _verifyAdapters(accountAddress);
        _verifyAssets(accountAddress);
        emit TestnetDeploymentVerified(
            accountAddress,
            vm.envAddress("CL_ACCOUNT_OWNER"),
            2,
            3
        );
    }

    function _verifyAccount(address accountAddress) internal {
        CLAccount account = CLAccount(payable(accountAddress));
        address expectedOwner = vm.envAddress("CL_ACCOUNT_OWNER");
        address policyManagerAddress = vm.envAddress("CL_RISK_POLICY_MANAGER");
        address defensiveExecutor = vm.envAddress("CL_DEFENSIVE_EXECUTOR");

        address actualOwner = account.owner();
        if (actualOwner != expectedOwner) revert OwnerMismatch(actualOwner, expectedOwner);
        if (!account.riskGuardEnabled()) revert RiskGuardDisabled();
        address actualGuard = address(account.riskGuard());
        if (actualGuard != policyManagerAddress) {
            revert RiskGuardMismatch(actualGuard, policyManagerAddress);
        }
        if (!account.defensiveOperator(defensiveExecutor)) {
            revert DefensiveOperatorMissing(defensiveExecutor);
        }
    }

    function _verifyAdapters(address accountAddress) internal {
        CLAccount account = CLAccount(payable(accountAddress));
        AdapterRegistry registry = AdapterRegistry(address(account.registry()));
        RiskPolicyManager policyManager =
            RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));

        _verifyExecutableAdapter(
            accountAddress,
            account,
            registry,
            policyManager,
            vm.envAddress("KURU_ADAPTER")
        );
        _verifyExecutableAdapter(
            accountAddress,
            account,
            registry,
            policyManager,
            vm.envAddress("PERPL_ADAPTER")
        );

        address walletBalanceAdapter = vm.envAddress("WALLET_BALANCE_ADAPTER");
        if (!policyManager.isAdapterCovered(accountAddress, walletBalanceAdapter)) {
            revert AdapterNotRiskCovered(walletBalanceAdapter);
        }
    }

    function _verifyExecutableAdapter(
        address accountAddress,
        CLAccount account,
        AdapterRegistry registry,
        RiskPolicyManager policyManager,
        address adapter
    ) internal view {
        if (!registry.isAdapterActive(adapter)) revert AdapterInactive(adapter);
        if (!account.authorizedAdapter(adapter)) revert AdapterUnauthorized(adapter);

        uint64 accountVersion = account.authorizedAdapterVersion(adapter);
        uint64 registryVersion = registry.adapterVersion(adapter);
        if (accountVersion != registryVersion) {
            revert AdapterAuthorizationStale(adapter, accountVersion, registryVersion);
        }

        if (!policyManager.isAdapterCovered(accountAddress, adapter)) {
            revert AdapterNotRiskCovered(adapter);
        }
    }

    function _verifyAssets(address accountAddress) internal {
        CLAccount account = CLAccount(payable(accountAddress));
        address[] memory allowedAssets = vm.envAddress("CL_ALLOWED_ASSETS", ",");
        for (uint256 i = 0; i < allowedAssets.length; ++i) {
            if (!account.allowedAsset(allowedAssets[i])) {
                revert AssetNotAllowed(allowedAssets[i]);
            }
        }
    }
}
