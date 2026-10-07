// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskTypes} from "../types/RiskTypes.sol";
import {RiskPolicyManager} from "../risk/RiskPolicyManager.sol";

/// @title RiskSolver
/// @notice Converts live CL policy breaches into deterministic economic recommendations.
/// @dev The solver deliberately returns venue-agnostic recommendations. Protocol-specific planners
///      choose adapters/actions later, and CLAccount still enforces all permissions and final risk.
contract RiskSolver {
    enum Action {
        NONE,
        HEDGE,
        REPAY,
        DELEVERAGE
    }

    struct Recommendation {
        Action action;
        bytes32 reason;
        address asset;
        int256 currentNetUsd;
        int256 targetNetUsd;
        uint256 reduceGrossUsd;
        uint256 repayDebtUsd;
        uint256 severityBps;
    }

    RiskPolicyManager public immutable policyManager;

    error ZeroAddress();
    error SignedOverflow();

    constructor(address policyManager_) {
        if (policyManager_ == address(0)) revert ZeroAddress();
        policyManager = RiskPolicyManager(policyManager_);
    }

    function solve(address account)
        external
        view
        returns (
            Recommendation memory recommendation,
            RiskTypes.PortfolioMetrics memory metrics,
            RiskTypes.AssetExposure[] memory exposures
        )
    {
        (bool ok, bytes32 reason, RiskTypes.PortfolioMetrics memory current, RiskTypes.AssetExposure[] memory currentExposures) =
            policyManager.check(account);
        metrics = current;
        exposures = currentExposures;

        if (ok) return (_none(), metrics, exposures);

        RiskTypes.Policy memory p = policyManager.policy(account);
        recommendation = _recommend(account, reason, p, metrics, exposures);
    }

    function _recommend(
        address account,
        bytes32 reason,
        RiskTypes.Policy memory p,
        RiskTypes.PortfolioMetrics memory metrics,
        RiskTypes.AssetExposure[] memory exposures
    ) internal view returns (Recommendation memory r) {
        (address topAsset, int256 topNetUsd) = _largestDirectionalExposure(exposures);
        uint256 repayDebtUsd = _debtReduction(p, metrics);
        uint256 grossReduction = _grossReduction(p, metrics);
        uint256 severity = _severity(reason, p, metrics);

        if (reason == policyManager.REASON_DEBT() || (topAsset == address(0) && repayDebtUsd != 0)) {
            r.action = Action.REPAY;
            r.reason = reason;
            r.reduceGrossUsd = grossReduction;
            r.repayDebtUsd = repayDebtUsd;
            r.severityBps = severity;
            return r;
        }

        int256 targetNetUsd = _targetNet(account, topAsset, topNetUsd);
        if (grossReduction == 0 && topAsset != address(0)) grossReduction = _abs(topNetUsd - targetNetUsd);

        r.action = topAsset == address(0) ? Action.DELEVERAGE : Action.HEDGE;
        r.reason = reason;
        r.asset = topAsset;
        r.currentNetUsd = topNetUsd;
        r.targetNetUsd = targetNetUsd;
        r.reduceGrossUsd = grossReduction;
        r.repayDebtUsd = repayDebtUsd;
        r.severityBps = severity;
    }

    function _none() internal pure returns (Recommendation memory r) {
        r.action = Action.NONE;
    }

    function _debtReduction(RiskTypes.Policy memory p, RiskTypes.PortfolioMetrics memory m)
        internal
        pure
        returns (uint256)
    {
        if (p.maxDebtUsd == 0 || m.debtUsd <= p.maxDebtUsd) return 0;
        return m.debtUsd - p.maxDebtUsd;
    }

    function _grossReduction(RiskTypes.Policy memory p, RiskTypes.PortfolioMetrics memory m)
        internal
        pure
        returns (uint256)
    {
        if (p.maxGrossExposureUsd == 0 || m.grossExposureUsd <= p.maxGrossExposureUsd) return 0;
        return m.grossExposureUsd - p.maxGrossExposureUsd;
    }

    function _targetNet(address account, address asset, int256 currentNetUsd) internal view returns (int256 targetNetUsd) {
        if (asset == address(0)) return 0;
        uint256 assetLimit = policyManager.assetLimitUsd(account, asset);
        if (assetLimit == 0 || _abs(currentNetUsd) <= assetLimit) return 0;
        int256 signedLimit = _toInt(assetLimit);
        return currentNetUsd < 0 ? -signedLimit : signedLimit;
    }

    function _largestDirectionalExposure(RiskTypes.AssetExposure[] memory exposures)
        internal
        pure
        returns (address asset, int256 netUsd)
    {
        uint256 largest;
        for (uint256 i; i < exposures.length; ++i) {
            uint256 magnitude = _abs(exposures[i].netUsd);
            if (magnitude > largest) {
                largest = magnitude;
                asset = exposures[i].asset;
                netUsd = exposures[i].netUsd;
            }
        }
    }

    function _severity(bytes32 reason, RiskTypes.Policy memory p, RiskTypes.PortfolioMetrics memory m)
        internal
        view
        returns (uint256)
    {
        if (reason == policyManager.REASON_GROSS_EXPOSURE()) {
            return _aboveLimitBps(m.grossExposureUsd, p.maxGrossExposureUsd);
        }
        if (reason == policyManager.REASON_DEBT()) return _aboveLimitBps(m.debtUsd, p.maxDebtUsd);
        if (reason == policyManager.REASON_LEVERAGE()) return _aboveLimitBps(m.leverageE18, p.maxLeverageE18);
        if (reason == policyManager.REASON_MARGIN_UTILIZATION()) {
            return _aboveLimitBps(m.marginUtilizationE18, p.maxMarginUtilizationE18);
        }
        if (reason == policyManager.REASON_HEALTH()) return _belowLimitBps(m.healthE18, p.minHealthE18);
        if (reason == policyManager.REASON_CRITICAL_MOVE()) {
            return _belowLimitBps(m.criticalMoveBps, p.minCriticalMoveBps);
        }
        return 10_000;
    }

    function _aboveLimitBps(uint256 value, uint256 limit) internal pure returns (uint256) {
        if (limit == 0 || value <= limit) return 0;
        uint256 bps = ((value - limit) * 10_000) / limit;
        return bps > 100_000 ? 100_000 : bps;
    }

    function _belowLimitBps(uint256 value, uint256 minimum) internal pure returns (uint256) {
        if (minimum == 0 || value >= minimum) return 0;
        return ((minimum - value) * 10_000) / minimum;
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
