// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskEngine} from "../src/risk/RiskEngine.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {IntentEngine} from "../src/intent/IntentEngine.sol";
import {CapitalRouter} from "../src/router/CapitalRouter.sol";
import {MultiStepPlanner} from "../src/planning/MultiStepPlanner.sol";
import {RiskSolver} from "../src/solver/RiskSolver.sol";
import {SimulationEngine} from "../src/simulation/SimulationEngine.sol";
import {DefensiveExecutor} from "../src/automation/DefensiveExecutor.sol";
import {KeeperNetwork} from "../src/automation/KeeperNetwork.sol";

interface VmRiskScript {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys the CL clearing-risk, intent, routing, planning, automation and simulation stack.
/// @dev Asset/instrument price configuration remains network-specific and is intentionally not guessed here.
contract DeployRiskAutomation {
    VmRiskScript internal constant vm = VmRiskScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    event RiskStackDeployed(
        address riskRegistry,
        address riskEngine,
        address policyManager,
        address solver,
        address simulator
    );
    event AutomationStackDeployed(
        address intentEngine,
        address capitalRouter,
        address planner,
        address defensiveExecutor,
        address keeperNetwork
    );

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        address adapterRegistry = vm.envAddress("ADAPTER_REGISTRY");

        vm.startBroadcast(key);

        RiskRegistry riskRegistry = new RiskRegistry(deployer);
        RiskEngine riskEngine = new RiskEngine(address(riskRegistry));
        RiskPolicyManager policyManager = new RiskPolicyManager(address(riskEngine));
        IntentEngine intentEngine = new IntentEngine();
        CapitalRouter capitalRouter = new CapitalRouter(adapterRegistry);
        MultiStepPlanner planner = new MultiStepPlanner(adapterRegistry);
        RiskSolver solver = new RiskSolver(address(policyManager));
        SimulationEngine simulator = new SimulationEngine(address(riskEngine));
        DefensiveExecutor defensiveExecutor = new DefensiveExecutor(deployer, address(policyManager));
        KeeperNetwork keeperNetwork = new KeeperNetwork(deployer, address(defensiveExecutor));

        // KeeperNetwork is the dispatch layer; individual keeper authorization remains inside it.
        defensiveExecutor.setKeeper(address(keeperNetwork), true);

        emit RiskStackDeployed(
            address(riskRegistry),
            address(riskEngine),
            address(policyManager),
            address(solver),
            address(simulator)
        );
        emit AutomationStackDeployed(
            address(intentEngine),
            address(capitalRouter),
            address(planner),
            address(defensiveExecutor),
            address(keeperNetwork)
        );

        vm.stopBroadcast();
    }
}
