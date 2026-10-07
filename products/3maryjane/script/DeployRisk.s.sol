// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskEngine} from "../src/risk/RiskEngine.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";

interface VmRiskScript {
    function envUint(string calldata) external returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployRisk {
    VmRiskScript internal constant vm = VmRiskScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (RiskRegistry registry, RiskEngine engine, RiskPolicyManager policyManager)
    {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        registry = new RiskRegistry(deployer);
        engine = new RiskEngine(address(registry));
        policyManager = new RiskPolicyManager(address(engine));
        vm.stopBroadcast();
    }
}
