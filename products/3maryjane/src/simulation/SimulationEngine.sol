// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskTypes} from "../types/RiskTypes.sol";
import {RiskEngine} from "../risk/RiskEngine.sol";

/// @title SimulationEngine
/// @notice Projects CL portfolio metrics under explicit planner/solver risk deltas.
/// @dev This is a risk-state simulator, not a protocol execution emulator. Exact venue execution
///      should still be dry-run with eth_call against CLAccount before broadcast.
contract SimulationEngine {
    struct PortfolioDelta {
        int256 assetsUsd;
        int256 debtUsd;
        int256 pnlUsd;
        int256 grossExposureUsd;
        int256 directionalExposureUsd;
        int256 initialMarginUsd;
        int256 maintenanceMarginUsd;
    }

    RiskEngine public immutable engine;

    error ZeroAddress();
    error InvalidDelta();
    error SignedOverflow();

    constructor(address engine_) {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = RiskEngine(engine_);
    }

    function simulate(address account, address[] calldata adapters, PortfolioDelta calldata delta)
        external
        view
        returns (RiskTypes.PortfolioMetrics memory projected)
    {
        (RiskTypes.PortfolioMetrics memory current,) = engine.portfolio(account, adapters);
        projected = current;

        projected.assetsUsd = _applyUnsigned(current.assetsUsd, delta.assetsUsd);
        projected.debtUsd = _applyUnsigned(current.debtUsd, delta.debtUsd);
        projected.pnlUsd = current.pnlUsd + delta.pnlUsd;
        projected.grossExposureUsd = _applyUnsigned(current.grossExposureUsd, delta.grossExposureUsd);
        projected.directionalExposureUsd =
            _applyUnsigned(current.directionalExposureUsd, delta.directionalExposureUsd);
        projected.initialMarginUsd = _applyUnsigned(current.initialMarginUsd, delta.initialMarginUsd);
        projected.maintenanceMarginUsd =
            _applyUnsigned(current.maintenanceMarginUsd, delta.maintenanceMarginUsd);

        projected.equityUsd = _toInt(projected.assetsUsd) - _toInt(projected.debtUsd) + projected.pnlUsd;
        projected.leverageE18 = _ratio(projected.grossExposureUsd, projected.equityUsd);
        projected.healthE18 = _health(projected.equityUsd, projected.maintenanceMarginUsd);
        projected.marginUtilizationE18 = _ratio(projected.initialMarginUsd, projected.equityUsd);
        projected.criticalMoveBps = _criticalMove(projected);
    }

    /// @notice Evaluate only aggregate policy fields against projected metrics.
    /// @dev Per-asset exposure limits require asset-level deltas and remain enforced on final execution.
    function passesGlobalPolicy(RiskTypes.PortfolioMetrics calldata m, RiskTypes.Policy calldata p)
        external
        pure
        returns (bool)
    {
        if (!p.enabled) return true;
        if (p.maxGrossExposureUsd != 0 && m.grossExposureUsd > p.maxGrossExposureUsd) return false;
        if (p.maxDebtUsd != 0 && m.debtUsd > p.maxDebtUsd) return false;
        if (p.maxLeverageE18 != 0 && m.leverageE18 > p.maxLeverageE18) return false;
        if (p.maxMarginUtilizationE18 != 0 && m.marginUtilizationE18 > p.maxMarginUtilizationE18) return false;
        if (p.minHealthE18 != 0 && m.healthE18 < p.minHealthE18) return false;
        if (p.minCriticalMoveBps != 0 && m.criticalMoveBps < p.minCriticalMoveBps) return false;
        return true;
    }

    function _applyUnsigned(uint256 base, int256 delta) internal pure returns (uint256) {
        if (delta >= 0) return base + uint256(delta);
        if (delta == type(int256).min) revert InvalidDelta();
        uint256 decrease = uint256(-delta);
        if (decrease > base) revert InvalidDelta();
        return base - decrease;
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

    function _toInt(uint256 value) internal pure returns (int256) {
        if (value > uint256(type(int256).max)) revert SignedOverflow();
        return int256(value);
    }
}
