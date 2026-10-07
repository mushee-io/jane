// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TestBase} from "./TestBase.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {CLTypes} from "../src/types/CLTypes.sol";
import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskEngine} from "../src/risk/RiskEngine.sol";
import {MockPriceSource} from "./mocks/MockPriceSource.sol";
import {MockRiskAdapter} from "./mocks/MockRiskAdapter.sol";

contract RiskEngineTest is TestBase {
    address internal constant MON = address(0x1111);
    address internal constant USDC = address(0x2222);
    address internal constant ACCOUNT = address(0xBEEF);
    bytes32 internal constant MON_PERP = keccak256("MON-PERP");

    RiskRegistry internal registry;
    RiskEngine internal engine;
    MockRiskAdapter internal spot;
    MockRiskAdapter internal perp;
    MockPriceSource internal monPrice;
    MockPriceSource internal usdcPrice;

    function setUp() public {
        registry = new RiskRegistry(address(this));
        engine = new RiskEngine(address(registry));

        monPrice = new MockPriceSource(2e18);
        usdcPrice = new MockPriceSource(1e18);

        registry.setAssetConfig(
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
        registry.setAssetConfig(
            USDC,
            RiskTypes.AssetConfig({
                priceSource: address(usdcPrice),
                decimals: 6,
                initialMarginBps: 500,
                maintenanceMarginBps: 250,
                hedgeMarginBps: 100,
                stressBps: 500,
                maxStaleness: 1 days,
                enabled: true
            })
        );
        registry.setInstrumentConfig(
            MON_PERP,
            RiskTypes.InstrumentConfig({
                underlyingAsset: MON,
                collateralAsset: USDC,
                exposureDecimals: 18,
                collateralDecimals: 6,
                pnlDecimals: 6,
                enabled: true
            })
        );

        spot = new MockRiskAdapter(keccak256("SPOT"), MON, keccak256("MON-SPOT"), CLTypes.PositionType.SPOT);
        perp = new MockRiskAdapter(keccak256("PERP"), address(0), MON_PERP, CLTypes.PositionType.PERP);

        spot.seed(ACCOUNT, int256(10e18), 0, 0, 0);
        perp.seed(ACCOUNT, -int256(6e18), 100e6, 0, 0);
    }

    function testCrossProtocolNettingAndPortfolioMargin() public view {
        address[] memory adapters = new address[](2);
        adapters[0] = address(spot);
        adapters[1] = address(perp);

        (RiskTypes.PortfolioMetrics memory m, RiskTypes.AssetExposure[] memory e) =
            engine.portfolio(ACCOUNT, adapters);

        assertEq(e.length, 1, "expected one MON risk bucket");
        assertTrue(e[0].netUsd == int256(8e18), "wrong net MON exposure");
        assertEq(e[0].grossUsd, 32e18, "wrong gross MON exposure");
        assertEq(e[0].hedgedPairUsd, 12e18, "wrong hedge pair");
        assertEq(m.assetsUsd, 120e18, "wrong equity assets");
        assertEq(m.grossExposureUsd, 32e18, "wrong gross exposure");
        assertEq(m.directionalExposureUsd, 8e18, "wrong directional exposure");
        assertEq(m.initialMarginUsd, 1_840_000_000_000_000_000, "wrong initial margin");
        assertEq(m.maintenanceMarginUsd, 1_040_000_000_000_000_000, "wrong maintenance margin");
        assertTrue(m.equityUsd == int256(120e18), "wrong equity");
        assertEq(m.criticalMoveBps, 10_000, "critical move should cap at 100%");
    }

    function testDefaultStressChargesDirectionalAndBasisRisk() public view {
        address[] memory adapters = new address[](2);
        adapters[0] = address(spot);
        adapters[1] = address(perp);

        RiskTypes.StressResult memory stress = engine.stressDefault(ACCOUNT, adapters);
        assertEq(stress.lossUsd, 1_840_000_000_000_000_000, "wrong stress loss");
        assertTrue(stress.pnlUsd == -int256(1_840_000_000_000_000_000), "wrong stress pnl");
    }

    function testCustomShockUsesNetExposureNotGross() public view {
        address[] memory adapters = new address[](2);
        adapters[0] = address(spot);
        adapters[1] = address(perp);
        RiskTypes.Shock[] memory shocks = new RiskTypes.Shock[](1);
        shocks[0] = RiskTypes.Shock({asset: MON, shockBps: -2500});

        RiskTypes.StressResult memory stress = engine.stressScenario(ACCOUNT, adapters, shocks);
        assertTrue(stress.pnlUsd == -int256(2e18), "scenario should shock net MON only");
        assertEq(stress.lossUsd, 2e18, "wrong custom stress loss");
    }

    function testStalePriceFailsClosed() public {
        uint256 observedAt = block.timestamp;
        monPrice.set(2e18, observedAt);
        vm.warp(observedAt + 1 days + 1);

        bytes memory expected = abi.encodeWithSelector(RiskRegistry.StalePrice.selector, MON, observedAt);
        vm.expectRevert(expected);
        registry.priceE18(MON);
    }

    function testPerpWithoutInstrumentMappingFailsClosed() public {
        bytes32 unknown = keccak256("UNMAPPED-PERP");
        MockRiskAdapter unmapped =
            new MockRiskAdapter(keccak256("UNMAPPED"), address(0), unknown, CLTypes.PositionType.PERP);
        unmapped.seed(ACCOUNT, int256(1e18), 1e6, 0, 0);

        address[] memory adapters = new address[](1);
        adapters[0] = address(unmapped);

        bytes memory expected = abi.encodeWithSelector(RiskEngine.MissingInstrumentConfig.selector, unknown);
        vm.expectRevert(expected);
        engine.portfolio(ACCOUNT, adapters);
    }
}
