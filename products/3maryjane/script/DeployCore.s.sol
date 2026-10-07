// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";

interface VmScript {
    function envUint(string calldata) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployCore {
    VmScript internal constant vm = VmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (AdapterRegistry registry, CLAccountFactory factory) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        registry = new AdapterRegistry(deployer);
        factory = new CLAccountFactory(address(registry));
        vm.stopBroadcast();
    }
}
