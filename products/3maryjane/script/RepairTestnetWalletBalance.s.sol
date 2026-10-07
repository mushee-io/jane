// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WalletBalanceAdapter} from "../src/adapters/WalletBalanceAdapter.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";

interface VmRepairWalletBalance {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice TESTNET ONLY. Replaces the legacy free-collateral reader with a clean
///         WalletBalanceAdapter that tracks only the live Perpl AUSD collateral.
/// @dev This avoids stale testnet token addresses left in the old adapter's tracked set.
contract RepairTestnetWalletBalance {
    VmRepairWalletBalance internal constant vm =
        VmRepairWalletBalance(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TestnetWalletBalanceRepaired(
        address indexed account,
        address indexed newWalletBalanceAdapter,
        address indexed collateral
    );

    function run() external returns (WalletBalanceAdapter newWalletAdapter) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);

        address account = vm.envAddress("CL_ACCOUNT");
        address perplAdapter = vm.envAddress("PERPL_ADAPTER");
        address collateral = vm.envAddress("PERPL_COLLATERAL");

        RiskPolicyManager policyManager =
            RiskPolicyManager(vm.envAddress("CL_RISK_POLICY_MANAGER"));

        RiskTypes.Policy memory currentPolicy = policyManager.policy(account);

        vm.startBroadcast(key);

        newWalletAdapter = new WalletBalanceAdapter(deployer);
        newWalletAdapter.addAsset(collateral);

        address[] memory riskAdapters = new address[](2);
        riskAdapters[0] = perplAdapter;
        riskAdapters[1] = address(newWalletAdapter);

        policyManager.configure(account, currentPolicy, riskAdapters);

        emit TestnetWalletBalanceRepaired(account, address(newWalletAdapter), collateral);

        vm.stopBroadcast();
    }
}
