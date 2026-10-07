// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../interfaces/ICLAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";
import {RiskTypes} from "../types/RiskTypes.sol";
import {RiskRegistry} from "./RiskRegistry.sol";

/// @title RiskEngine
/// @notice Cross-protocol valuation, net exposure, leverage, margin, health and stress engine for CL.
/// @dev Enforcement paths fail closed when any configured adapter cannot be read.
contract RiskEngine {
    RiskRegistry public immutable registry;

    error ZeroAddress();
    error AdapterReadFailed(address adapter);
    error MissingInstrumentConfig(bytes32 instrumentId);
    error SignedOverflow();

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = RiskRegistry(registry_);
    }

    function valuePosition(CLTypes.Position calldata position)
        external
        view
        returns (RiskTypes.ValuedPosition memory)
    {
        CLTypes.Position memory p = position;
        return _valuePosition(p);
    }

    function portfolio(address account, address[] calldata adapters)
        external
        view
        returns (RiskTypes.PortfolioMetrics memory metrics, RiskTypes.AssetExposure[] memory exposures)
    {
        address[] memory adapters_ = adapters;
        return _portfolio(account, adapters_);
    }

    function stressDefault(address account, address[] calldata adapters)
        external
        view
        returns (RiskTypes.StressResult memory result)
    {
        address[] memory adapters_ = adapters;
        (RiskTypes.PortfolioMetrics memory metrics, RiskTypes.AssetExposure[] memory exposures) =
            _portfolio(account, adapters_);

        uint256 loss;
        for (uint256 i; i < exposures.length; ++i) {
            RiskTypes.AssetConfig memory config = registry.requireAssetConfig(exposures[i].asset);
            loss += exposures[i].grossUsd == 0
                ? 0
                : (_abs(exposures[i].netUsd) * config.stressBps) / RiskTypes.BPS;
            loss += (exposures[i].hedgedPairUsd * config.hedgeMarginBps) / RiskTypes.BPS;
        }

        int256 stressedEquity = metrics.equityUsd - _toInt(loss);
        result = RiskTypes.StressResult({
            pnlUsd: -_toInt(loss),
            stressedEquityUsd: stressedEquity,
            stressedHealthE18: _health(stressedEquity, metrics.maintenanceMarginUsd),
            lossUsd: loss
        });
    }

    function stressScenario(address account, address[] calldata adapters, RiskTypes.Shock[] calldata shocks)
        external
        view
        returns (RiskTypes.StressResult memory result)
    {
        address[] memory adapters_ = adapters;
        (RiskTypes.PortfolioMetrics memory metrics, RiskTypes.AssetExposure[] memory exposures) =
            _portfolio(account, adapters_);

        int256 scenarioPnl;
        for (uint256 i; i < exposures.length; ++i) {
            int32 shockBps = _findShock(exposures[i].asset, shocks);
            if (shockBps == 0 || exposures[i].netUsd == 0) continue;
            scenarioPnl += (exposures[i].netUsd * int256(shockBps)) / int256(RiskTypes.BPS);
        }

        int256 stressedEquity = metrics.equityUsd + scenarioPnl;
        uint256 loss = scenarioPnl < 0 ? _abs(scenarioPnl) : 0;
        result = RiskTypes.StressResult({
            pnlUsd: scenarioPnl,
            stressedEquityUsd: stressedEquity,
            stressedHealthE18: _health(stressedEquity, metrics.maintenanceMarginUsd),
            lossUsd: loss
        });
    }

    function _portfolio(address account, address[] memory adapters)
        internal
        view
        returns (RiskTypes.PortfolioMetrics memory metrics, RiskTypes.AssetExposure[] memory exposures)
    {
        CLTypes.Position[] memory positions = _collectPositions(account, adapters);
        exposures = new RiskTypes.AssetExposure[](positions.length);
        uint256 exposureCount;

        for (uint256 i; i < positions.length; ++i) {
            CLTypes.Position memory p = positions[i];
            RiskTypes.ValuedPosition memory v = _valuePosition(p);

            metrics.pnlUsd += v.pnlUsd;
            metrics.grossExposureUsd += v.grossUsd;

            if (
                p.positionType == CLTypes.PositionType.CASH || p.positionType == CLTypes.PositionType.SPOT
                    || p.positionType == CLTypes.PositionType.SUPPLY || p.positionType == CLTypes.PositionType.LP
            ) {
                if (v.signedUsd >= 0) metrics.assetsUsd += uint256(v.signedUsd);
                else metrics.debtUsd += _abs(v.signedUsd);
            } else if (p.positionType == CLTypes.PositionType.DEBT) {
                metrics.debtUsd += v.debtUsd != 0 ? v.debtUsd : _abs(v.signedUsd);
            } else if (p.positionType == CLTypes.PositionType.PERP) {
                metrics.assetsUsd += v.collateralUsd;
            } else {
                if (v.signedUsd >= 0) metrics.assetsUsd += uint256(v.signedUsd);
                else metrics.debtUsd += _abs(v.signedUsd);
            }

            uint256 bucket = _findOrCreateBucket(exposures, exposureCount, v.underlyingAsset);
            if (bucket == exposureCount) ++exposureCount;
            exposures[bucket].netUsd += v.signedUsd;
            exposures[bucket].grossUsd += v.grossUsd;
        }

        assembly {
            mstore(exposures, exposureCount)
        }

        for (uint256 i; i < exposures.length; ++i) {
            RiskTypes.AssetExposure memory e = exposures[i];
            RiskTypes.AssetConfig memory config = registry.requireAssetConfig(e.asset);
            uint256 netAbs = _abs(e.netUsd);
            uint256 hedgedPair = e.grossUsd > netAbs ? (e.grossUsd - netAbs) / 2 : 0;
            uint256 initialMargin =
                (netAbs * config.initialMarginBps) / RiskTypes.BPS
                    + (hedgedPair * config.hedgeMarginBps) / RiskTypes.BPS;
            uint256 maintenanceMargin =
                (netAbs * config.maintenanceMarginBps) / RiskTypes.BPS
                    + (hedgedPair * config.hedgeMarginBps) / RiskTypes.BPS;

            exposures[i].hedgedPairUsd = hedgedPair;
            exposures[i].initialMarginUsd = initialMargin;
            exposures[i].maintenanceMarginUsd = maintenanceMargin;

            metrics.directionalExposureUsd += netAbs;
            metrics.initialMarginUsd += initialMargin;
            metrics.maintenanceMarginUsd += maintenanceMargin;
        }

        metrics.equityUsd = _toInt(metrics.assetsUsd) - _toInt(metrics.debtUsd) + metrics.pnlUsd;
        metrics.leverageE18 = _ratio(metrics.grossExposureUsd, metrics.equityUsd);
        metrics.healthE18 = _health(metrics.equityUsd, metrics.maintenanceMarginUsd);
        metrics.marginUtilizationE18 = _ratio(metrics.initialMarginUsd, metrics.equityUsd);
        metrics.criticalMoveBps = _criticalMove(metrics);
    }

    function _valuePosition(CLTypes.Position memory p)
        internal
        view
        returns (RiskTypes.ValuedPosition memory v)
    {
        RiskTypes.InstrumentConfig memory instrument = registry.getInstrumentConfig(p.instrumentId);

        address underlying;
        address collateralAsset;
        uint8 exposureDecimals;
        uint8 collateralDecimals;
        uint8 pnlDecimals;

        if (instrument.enabled) {
            underlying = instrument.underlyingAsset;
            collateralAsset = instrument.collateralAsset;
            exposureDecimals = instrument.exposureDecimals;
            collateralDecimals = instrument.collateralDecimals;
            pnlDecimals = instrument.pnlDecimals;
        } else {
            if (p.positionType == CLTypes.PositionType.PERP) revert MissingInstrumentConfig(p.instrumentId);
            RiskTypes.AssetConfig memory config = registry.requireAssetConfig(p.asset);
            underlying = p.asset;
            collateralAsset = p.asset;
            exposureDecimals = config.decimals;
            collateralDecimals = config.decimals;
            pnlDecimals = config.decimals;
        }

        uint256 underlyingPrice = registry.priceE18(underlying);
        uint256 collateralPrice = collateralAsset == underlying ? underlyingPrice : registry.priceE18(collateralAsset);

        int256 signedUsd = _signedValue(p.signedExposure, underlyingPrice, exposureDecimals);
        uint256 collateralUsd = _unsignedValue(p.collateral, collateralPrice, collateralDecimals);
        uint256 debtUsd = _unsignedValue(p.debt, underlyingPrice, exposureDecimals);
        int256 pnlUsd = _signedValue(p.pnl, collateralPrice, pnlDecimals);

        v = RiskTypes.ValuedPosition({
            protocolId: p.protocolId,
            instrumentId: p.instrumentId,
            underlyingAsset: underlying,
            collateralAsset: collateralAsset,
            positionType: uint8(p.positionType),
            signedUsd: signedUsd,
            grossUsd: _abs(signedUsd),
            collateralUsd: collateralUsd,
            debtUsd: debtUsd,
            pnlUsd: pnlUsd
        });
    }

    function _collectPositions(address account, address[] memory adapters)
        internal
        view
        returns (CLTypes.Position[] memory positions)
    {
        CLTypes.Position[][] memory byAdapter = new CLTypes.Position[][](adapters.length);
        uint256 total;

        for (uint256 i; i < adapters.length; ++i) {
            try ICLAdapter(adapters[i]).getPositions(account) returns (CLTypes.Position[] memory p) {
                byAdapter[i] = p;
                total += p.length;
            } catch {
                revert AdapterReadFailed(adapters[i]);
            }
        }

        positions = new CLTypes.Position[](total);
        uint256 cursor;
        for (uint256 i; i < byAdapter.length; ++i) {
            for (uint256 j; j < byAdapter[i].length; ++j) {
                positions[cursor++] = byAdapter[i][j];
            }
        }
    }

    function _findOrCreateBucket(
        RiskTypes.AssetExposure[] memory exposures,
        uint256 count,
        address asset
    ) internal pure returns (uint256 index) {
        for (uint256 i; i < count; ++i) {
            if (exposures[i].asset == asset) return i;
        }
        exposures[count].asset = asset;
        return count;
    }

    function _criticalMove(RiskTypes.PortfolioMetrics memory metrics) internal pure returns (uint256) {
        if (metrics.equityUsd <= 0 || uint256(metrics.equityUsd) <= metrics.maintenanceMarginUsd) return 0;
        if (metrics.directionalExposureUsd == 0) return RiskTypes.BPS;
        uint256 buffer = uint256(metrics.equityUsd) - metrics.maintenanceMarginUsd;
        uint256 bps = (buffer * RiskTypes.BPS) / metrics.directionalExposureUsd;
        return bps > RiskTypes.BPS ? RiskTypes.BPS : bps;
    }

    function _health(int256 equityUsd, uint256 maintenanceMarginUsd) internal pure returns (uint256) {
        if (equityUsd <= 0) return 0;
        if (maintenanceMarginUsd == 0) return type(uint256).max;
        return (uint256(equityUsd) * RiskTypes.WAD) / maintenanceMarginUsd;
    }

    function _ratio(uint256 numerator, int256 denominator) internal pure returns (uint256) {
        if (denominator <= 0) return numerator == 0 ? 0 : type(uint256).max;
        return (numerator * RiskTypes.WAD) / uint256(denominator);
    }

    function _unsignedValue(uint256 amount, uint256 priceE18, uint8 decimals) internal pure returns (uint256) {
        if (amount == 0) return 0;
        return (amount * priceE18) / (10 ** uint256(decimals));
    }

    function _signedValue(int256 amount, uint256 priceE18, uint8 decimals) internal pure returns (int256) {
        if (amount == 0) return 0;
        uint256 value = _unsignedValue(_abs(amount), priceE18, decimals);
        int256 signed = _toInt(value);
        return amount < 0 ? -signed : signed;
    }

    function _findShock(address asset, RiskTypes.Shock[] calldata shocks) internal pure returns (int32) {
        for (uint256 i; i < shocks.length; ++i) {
            if (shocks[i].asset == asset) return shocks[i].shockBps;
        }
        return 0;
    }

    function _abs(int256 value) internal pure returns (uint256) {
        if (value == type(int256).min) revert SignedOverflow();
        return uint256(value < 0 ? -value : value);
    }

    function _toInt(uint256 value) internal pure returns (int256) {
        if (value > uint256(type(int256).max)) revert SignedOverflow();
        return int256(value);
    }
}
