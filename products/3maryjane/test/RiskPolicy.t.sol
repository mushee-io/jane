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
import {MockPriceSource} from "./mocks/MockPriceSource.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";

contract RiskPolicyTest is TestBase {
    address internal admin = address(0xA11CE);
    address internal user = address(0xB0B);
    address internal constant MON = address(0x1111);

    AdapterRegistry internal adapterRegistry;
    CLAccount internal account;
    RiskRegistry internal riskRegistry;
    RiskEngine internal riskEngine;
    RiskPolicyManager internal policyManager;
    MockRiskAdapter internal riskAdapter;

    function setUp() public {
        vm.prank(admin);
        adapterRegistry = new AdapterRegistry(admin);
        CLAccountFactory factory = new CLAccountFactory(address(adapterRegistry));

        vm.prank(user);
        account = CLAccount(payable(factory.createAccount(bytes32("risk"))));

        riskRegistry = new RiskRegistry(address(this));
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
            new MockRiskAdapter(keccak256("RISK_SPOT"), MON, keccak256("MON-SPOT"), CLTypes.PositionType.SPOT);

        riskAdapter.seed(address(account), int256(1e18), 0, 0, 0);

        vm.startPrank(admin);
        adapterRegistry.setAdapterActive(address(riskAdapter), true);
        adapterRegistry.setTargetAllowed(address(riskAdapter), address(riskAdapter), true);
        vm.stopPrank();

        address[] memory covered = new address[](1);
        covered[0] = address(riskAdapter);
        RiskTypes.Policy memory policy_ = RiskTypes.Policy({
            enabled: true,
            allowRiskReducingWhenBreached: false,
            maxGrossExposureUsd: 3e18,
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
    }

    function testUnsafeTransitionRevertsUnderlyingProtocolMutation() public {
        bytes memory action = abi.encode(int256(3e18), uint256(0), uint256(0), int256(0));
        bytes memory expected = abi.encodeWithSelector(
            CLAccount.RiskPolicyViolation.selector,
            policyManager.REASON_GROSS_EXPOSURE()
        );

        vm.expectRevert(expected);
        vm.prank(user);
        account.execute(address(riskAdapter), action);

        (int256 exposure,,,) = riskAdapter.state(address(account));
        assertTrue(exposure == int256(1e18), "risk rejection must revert adapter state atomically");
    }

    function testCompliantTransitionPasses() public {
        bytes memory action = abi.encode(int256(1.25e18), uint256(0), uint256(0), int256(0));
        vm.prank(user);
        account.execute(address(riskAdapter), action);

        (int256 exposure,,,) = riskAdapter.state(address(account));
        assertTrue(exposure == int256(1.25e18), "compliant transition did not commit");
    }
}
