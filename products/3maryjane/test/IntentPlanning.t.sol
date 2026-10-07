// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {CLAccount} from "../src/CLAccount.sol";
import {CLAccountFactory} from "../src/CLAccountFactory.sol";
import {CLTypes} from "../src/types/CLTypes.sol";
import {IntentEngine} from "../src/intent/IntentEngine.sol";
import {MultiStepPlanner} from "../src/planning/MultiStepPlanner.sol";
import {CapitalRouter} from "../src/router/CapitalRouter.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";

contract IntentPlanningTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal constant MON = address(0x1111);

    AdapterRegistry internal registry;
    CLAccount internal account;
    MockRiskAdapter internal adapter;

    function setUp() public {
        vm.prank(admin);
        registry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(registry));
        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("intent"))));

        adapter = new MockRiskAdapter(
            keccak256("INTENT_SPOT"), MON, keccak256("MON-SPOT"), CLTypes.PositionType.SPOT
        );
        vm.prank(admin);
        registry.setAdapterActive(address(adapter), true);
    }

    function testIntentCanBindExactMultiStepPlan() public {
        IntentEngine intents = new IntentEngine();
        MultiStepPlanner planner = new MultiStepPlanner(address(registry));

        vm.prank(user);
        bytes32 intentId = intents.createIntent(
            address(account),
            IntentEngine.IntentKind.HEDGE,
            MON,
            int256(0),
            10_000e18,
            uint64(block.timestamp + 1 hours),
            keccak256("max-slippage-25bps"),
            keccak256("delta-neutral-mon")
        );

        CLTypes.AdapterAction[] memory actions = new CLTypes.AdapterAction[](1);
        actions[0] = CLTypes.AdapterAction({
            adapter: address(adapter),
            action: abi.encode(int256(1e18), uint256(0), uint256(0), int256(0))
        });

        vm.prank(user);
        bytes32 planId = planner.createPlan(
            address(account), intentId, actions, uint64(block.timestamp + 30 minutes)
        );

        assertTrue(planner.validatePlan(planId, actions), "exact plan should validate");
        vm.prank(user);
        intents.bindPlan(intentId, planId);

        IntentEngine.Intent memory intent = intents.getIntent(intentId);
        assertTrue(intent.boundPlanId == planId, "intent did not bind plan");
    }

    function testRouterSelectsBestConservativeRoute() public {
        CapitalRouter router = new CapitalRouter(address(registry));
        CapitalRouter.RouteQuote[] memory quotes = new CapitalRouter.RouteQuote[](2);
        quotes[0] = CapitalRouter.RouteQuote({
            routeId: keccak256("route-a"),
            adapter: address(adapter),
            inputUsd: 100e18,
            outputUsd: 100e18,
            gasUsd: 1e18,
            riskPenaltyUsd: 1e18,
            slippageBps: 20,
            deadline: uint64(block.timestamp + 10 minutes)
        });
        quotes[1] = CapitalRouter.RouteQuote({
            routeId: keccak256("route-b"),
            adapter: address(adapter),
            inputUsd: 100e18,
            outputUsd: 99e18,
            gasUsd: 2e17,
            riskPenaltyUsd: 1e17,
            slippageBps: 10,
            deadline: uint64(block.timestamp + 10 minutes)
        });

        (uint256 index, CapitalRouter.RouteQuote memory selected, uint256 netValueUsd) =
            router.selectBest(quotes, 100e18, 98e18, 25);

        assertEq(index, 1, "wrong route selected");
        assertTrue(selected.routeId == keccak256("route-b"), "wrong route id");
        assertEq(netValueUsd, 98_700_000_000_000_000_000, "wrong conservative route value");
    }
}
