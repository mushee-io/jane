// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLAccount} from "../src/CLAccount.sol";
import {WalletBalanceAdapter} from "../src/adapters/WalletBalanceAdapter.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmRepairPerplAccount {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Repoints an existing testnet CL account at the repaired Perpl adapter/collateral.
contract MigrateTestnetPerplAccount {
    VmRepairPerplAccount internal constant vm =
        VmRepairPerplAccount(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TestnetPerplAccountMigrated(address indexed account, address indexed perplAdapter, address indexed collateral);

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address accountAddress = vm.envAddress("CL_ACCOUNT");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address collateral = vm.envAddress("PERPL_COLLATERAL");
        address kuruAdapter = vm.envAddress("KURU_ADAPTER");
        address walletAdapter = vm.envAddress("WALLET_BALANCE_ADAPTER");
        address policyManagerAddress = vm.envAddress("CL_RISK_POLICY_MANAGER");

        vm.startBroadcast(key);

        CLAccount account = CLAccount(payable(accountAddress));
        account.setAssetAllowed(collateral, true);
        WalletBalanceAdapter(walletAdapter).addAsset(collateral);
        account.authorizeAdapter(perplAdapter, true);

        address[] memory riskAdapters = new address[](3);
        riskAdapters[0] = kuruAdapter;
        riskAdapters[1] = perplAdapter;
        riskAdapters[2] = walletAdapter;

        RiskPolicyManager(policyManagerAddress).configure(
            accountAddress,
            RiskTypes.Policy({
                enabled: true,
                allowRiskReducingWhenBreached: true,
                maxGrossExposureUsd: vm.envUint("CL_POLICY_MAX_GROSS_USD_E18"),
                maxDebtUsd: vm.envUint("CL_POLICY_MAX_DEBT_USD_E18"),
                maxLeverageE18: vm.envUint("CL_POLICY_MAX_LEVERAGE_E18"),
                maxMarginUtilizationE18: vm.envUint("CL_POLICY_MAX_MARGIN_UTILIZATION_E18"),
                minHealthE18: vm.envUint("CL_POLICY_MIN_HEALTH_E18"),
                minCriticalMoveBps: uint16(vm.envUint("CL_POLICY_MIN_CRITICAL_MOVE_BPS"))
            }),
            riskAdapters
        );

        emit TestnetPerplAccountMigrated(accountAddress, perplAdapter, collateral);
        vm.stopBroadcast();
    }
}
