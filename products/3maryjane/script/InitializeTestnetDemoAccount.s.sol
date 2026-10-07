// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmTestnetAccount {
    function envUint(string calldata) external returns (uint256);
    function envBytes32(string calldata) external returns (bytes32);
    function envAddress(string calldata) external returns (address);
    function envAddress(string calldata, string calldata) external returns (address[] memory);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Creates a TESTNET 3maryjane account covered by Kuru + Perpl + free collateral.
/// @dev Euler is intentionally omitted on testnet.
contract InitializeTestnetDemoAccount {
    VmTestnetAccount internal constant vm =
        VmTestnetAccount(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TestnetAccountInitialized(address indexed owner, address indexed account, bytes32 indexed salt);

    function run() external returns (address accountAddress) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        bytes32 salt = vm.envBytes32("CL_ACCOUNT_SALT");
        CLAccountFactory factory = CLAccountFactory(vm.envAddress("CL_ACCOUNT_FACTORY"));

        vm.startBroadcast(key);

        accountAddress = factory.createAccount(salt);
        CLAccount account = CLAccount(payable(accountAddress));

        address[] memory allowedAssets = vm.envAddress("CL_ALLOWED_ASSETS", ",");
        for (uint256 i = 0; i < allowedAssets.length; ++i) {
            account.setAssetAllowed(allowedAssets[i], true);
        }

        address kuruAdapter = vm.envAddress("KURU_ADAPTER");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address walletBalanceAdapter = vm.envAddress("WALLET_BALANCE_ADAPTER");

        account.authorizeAdapter(kuruAdapter, true);
        account.authorizeAdapter(perplAdapter, true);

        address[] memory riskAdapters = new address[](3);
        riskAdapters[0] = kuruAdapter;
        riskAdapters[1] = perplAdapter;
        riskAdapters[2] = walletBalanceAdapter;

        address policyManagerAddress = vm.envAddress("CL_RISK_POLICY_MANAGER");
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

        account.setRiskGuard(policyManagerAddress, true);
        account.setDefensiveOperator(vm.envAddress("CL_DEFENSIVE_EXECUTOR"), true);

        emit TestnetAccountInitialized(vm.addr(key), accountAddress, salt);
        vm.stopBroadcast();
    }
}
