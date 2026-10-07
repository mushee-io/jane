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
import {DefensiveExecutor} from "../src/automation/DefensiveExecutor.sol";
import {KeeperNetwork} from "../src/automation/KeeperNetwork.sol";
import {MockPriceSource} from "./mocks/MockPriceSource.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";

contract AutomationTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal constant MON = address(0x1111);

    AdapterRegistry internal adapterRegistry;
    CLAccount internal account;
    RiskPolicyManager internal policyManager;
    MockRiskAdapter internal riskAdapter;
    DefensiveExecutor internal executor;

    function setUp() public {
        vm.prank(admin);
        adapterRegistry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(adapterRegistry));
        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("auto"))));

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

        RiskEngine riskEngine = new RiskEngine(address(riskRegistry));
        policyManager = new RiskPolicyManager(address(riskEngine));
        riskAdapter =
            new MockRiskAdapter(keccak256("AUTO_SPOT"), MON, keccak256("MON-SPOT"), CLTypes.PositionType.SPOT);
        riskAdapter.seed(address(account), int256(3e18), 0, 0, 0);

        vm.startPrank(admin);
        adapterRegistry.setAdapterActive(address(riskAdapter), true);
        adapterRegistry.setTargetAllowed(address(riskAdapter), address(riskAdapter), true);
        vm.stopPrank();

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

        vm.startPrank(user);
        policyManager.configure(address(account), policy_, covered);
        account.authorizeAdapter(address(riskAdapter), true);
        account.setRiskGuard(address(policyManager), true);
        vm.stopPrank();

        executor = new DefensiveExecutor(address(this), address(policyManager));
        executor.setKeeper(address(this), true);
        vm.prank(user);
        account.setDefensiveOperator(address(executor), true);
    }

    function testKeeperCanReduceBreachedExposure() public {
        CLTypes.AdapterAction[] memory actions = _action(int256(1e18));
        executor.executeDefense(address(account), actions);

        (int256 exposure,,,) = riskAdapter.state(address(account));
        assertTrue(exposure == int256(1e18), "defense did not reduce exposure");
    }

    function testKeeperCannotIncreaseRisk() public {
        CLTypes.AdapterAction[] memory actions = _action(int256(4e18));
        bytes memory expected = abi.encodeWithSelector(
            CLAccount.RiskPolicyViolation.selector, policyManager.REASON_NOT_RISK_REDUCING()
        );
        vm.expectRevert(expected);
        executor.executeDefense(address(account), actions);

        (int256 exposure,,,) = riskAdapter.state(address(account));
        assertTrue(exposure == int256(3e18), "failed defense must roll back adapter state");
    }

    function testKeeperNetworkDispatchesUserJob() public {
        KeeperNetwork network = new KeeperNetwork(address(this), address(executor));
        executor.setKeeper(address(network), true);
        network.setKeeper(address(this), true);

        vm.prank(user);
        bytes32 jobId = network.createJob(address(account), 60, 2);

        CLTypes.AdapterAction[] memory actions = _action(int256(1e18));
        network.executeJob(jobId, actions);

        (int256 exposure,,,) = riskAdapter.state(address(account));
        assertTrue(exposure == int256(1e18), "keeper job did not execute defense");
        KeeperNetwork.Job memory job = network.getJob(jobId);
        assertTrue(job.lastExecutedAt != 0, "job execution timestamp missing");
    }

    function _action(int256 exposure) internal view returns (CLTypes.AdapterAction[] memory actions) {
        actions = new CLTypes.AdapterAction[](1);
        actions[0] = CLTypes.AdapterAction({
            adapter: address(riskAdapter),
            action: abi.encode(exposure, uint256(0), uint256(0), int256(0))
        });
    }
}
