// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PerplAdapter} from "../src/adapters/PerplAdapter.sol";

interface VmRepairPerplDeploy {
    function envUint(string calldata) external returns (uint256);
    function envUint(string calldata, string calldata) external returns (uint256[] memory);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys only the Perpl adapter when the live testnet collateral configuration changes.
contract DeployTestnetPerplAdapter {
    VmRepairPerplDeploy internal constant vm =
        VmRepairPerplDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TestnetPerplAdapterDeployed(address indexed adapter, address indexed exchange, address indexed collateral);

    function run() external returns (PerplAdapter adapter) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        uint256[] memory trackedPerps = vm.envUint("PERPL_TRACKED_PERP_IDS", ",");

        vm.startBroadcast(key);
        adapter = new PerplAdapter(
            vm.envAddress("PERPL_EXCHANGE"),
            vm.envAddress("PERPL_COLLATERAL"),
            trackedPerps
        );
        emit TestnetPerplAdapterDeployed(
            address(adapter),
            vm.envAddress("PERPL_EXCHANGE"),
            vm.envAddress("PERPL_COLLATERAL")
        );
        vm.stopBroadcast();
    }
}
