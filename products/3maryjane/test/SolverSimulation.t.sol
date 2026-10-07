// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {CLTypes} from "../src/types/CLTypes.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskEngine} from "../src/risk/RiskEngine.sol";
import {RiskPolicyManager} from "../src/risk/RiskPolicyManager.sol";
import {RiskSolver} from "../src/solver/RiskSolver.sol";
import {SimulationEngine} from "../src/simulation/SimulationEngine.sol";
import {MockPriceSource} from "./mocks/MockPriceSource.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";

contract SolverSimulationTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal constant MON = address(0x1111);

    CLAccount internal account;
    RiskEngine internal riskEngine;
    RiskPolicyManager internal policyManager;
    MockRiskAdapter internal riskAdapter;

    function setUp() public {
        vm.prank(admin);
        AdapterRegistry adapterRegistry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(adapterRegistry));
        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("solver"))));

        RiskRegistry riskRegistry = new RiskRegistry(address(this));
        MockPriceSource monPrice = new MockPriceSource(2e18);
        riskRegistry.setAssetConfig(
            MON,
            RiskTypes.AssetConfig({
                priceSource: address(monPrice),
                decimals: 18,
                initialMarginBps: 2000,
                maintenanceMarginBps: 1000,
                hedgeMarginBps: 200,
                stressBps: 2000,
                maxStaleness: 1 days,
                enabled: true
            })
        );

        riskEngine = new RiskEngine(address(riskRegistry));
        policyManager = new RiskPolicyManager(address(riskEngine));
        riskAdapter =
            new MockRiskAdapter(keccak256("SOLVER_SPOT"), MON, keccak256("MON-SPOT"), CLTypes.PositionType.SPOT);
        riskAdapter.seed(address(account), int256(3e18), 0, 0, 0);

        address[] memory covered = new address[](1);
        covered[0] = address(riskAdapter);
        RiskTypes.Policy memory policy_ = RiskTypes.Policy({
            enabled: true,
            allowRiskReducingWhenBreached: false,
            maxGrossExposureUsd: 4e18,
            maxDebtUsd: 0,
            maxLeverageE18: 0,
            maxMarginUtilizationE18: 0,
            minHealthE18: 0,
            minCriticalMoveBps: 0
        });
        vm.prank(user);
        policyManager.configure(address(account), policy_, covered);
    }

    function testSolverProducesHedgeRecommendationForGrossBreach() public {
        RiskSolver solver = new RiskSolver(address(policyManager));
        (RiskSolver.Recommendation memory r, RiskTypes.PortfolioMetrics memory m,) =
            solver.solve(address(account));

        assertTrue(r.action == RiskSolver.Action.HEDGE, "expected hedge recommendation");
        assertTrue(r.asset == MON, "expected MON as largest exposure");
        assertTrue(r.currentNetUsd == int256(6e18), "wrong current net exposure");
        assertTrue(r.targetNetUsd == 0, "expected neutral target without explicit asset limit");
        assertEq(r.reduceGrossUsd, 2e18, "wrong gross reduction");
        assertEq(r.severityBps, 5000, "wrong breach severity");
        assertEq(m.grossExposureUsd, 6e18, "wrong live gross exposure");
    }

    function testSimulationProjectsImprovedHealthAfterDeleveraging() public {
        SimulationEngine simulator = new SimulationEngine(address(riskEngine));
        address[] memory adapters = new address[](1);
        adapters[0] = address(riskAdapter);

        SimulationEngine.PortfolioDelta memory delta = SimulationEngine.PortfolioDelta({
            assetsUsd: 0,
            debtUsd: 0,
            pnlUsd: 0,
            grossExposureUsd: -int256(2e18),
            directionalExposureUsd: -int256(2e18),
            initialMarginUsd: -int256(4e17),
            maintenanceMarginUsd: -int256(2e17)
        });

        RiskTypes.PortfolioMetrics memory projected = simulator.simulate(address(account), adapters, delta);
        assertEq(projected.grossExposureUsd, 4e18, "wrong projected gross");
        assertEq(projected.directionalExposureUsd, 4e18, "wrong projected directional");
        assertTrue(projected.healthE18 == 15e18, "wrong projected health");
        assertTrue(projected.leverageE18 < 1e18, "projected leverage should improve");
        assertEq(projected.criticalMoveBps, 10_000, "projected buffer should cap at 100%");
    }
}
