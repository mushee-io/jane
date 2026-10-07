// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRiskGuard} from "../interfaces/IRiskGuard.sol";
import {RiskTypes} from "../types/RiskTypes.sol";
import {RiskEngine} from "./RiskEngine.sol";

interface ICLAccountOwner {
    function owner() external view returns (address);
}

/// @title RiskPolicyManager
/// @notice Enforces owner-defined cross-protocol portfolio constraints after CL actions.
/// @dev A breached account may optionally execute a transition that strictly reduces portfolio risk.
contract RiskPolicyManager is IRiskGuard {
    RiskEngine public immutable engine;

    mapping(address account => RiskTypes.Policy policy) private _policy;
    mapping(address account => address[] adapters) private _adapters;
    mapping(address account => mapping(address adapter => bool covered)) private _covered;
    mapping(address account => mapping(address asset => uint256 maxAbsNetUsd)) public assetLimitUsd;
    mapping(address account => mapping(address asset => bool tracked)) private _assetLimitTracked;
    mapping(address account => address[] assets) private _limitedAssets;

    bytes32 public constant REASON_POLICY_DISABLED = keccak256("POLICY_DISABLED");
    bytes32 public constant REASON_GROSS_EXPOSURE = keccak256("MAX_GROSS_EXPOSURE");
    bytes32 public constant REASON_DEBT = keccak256("MAX_DEBT");
    bytes32 public constant REASON_LEVERAGE = keccak256("MAX_LEVERAGE");
    bytes32 public constant REASON_MARGIN_UTILIZATION = keccak256("MAX_MARGIN_UTILIZATION");
    bytes32 public constant REASON_HEALTH = keccak256("MIN_HEALTH");
    bytes32 public constant REASON_CRITICAL_MOVE = keccak256("MIN_CRITICAL_MOVE");
    bytes32 public constant REASON_ASSET_EXPOSURE = keccak256("MAX_ASSET_EXPOSURE");
    bytes32 public constant REASON_NOT_RISK_REDUCING = keccak256("NOT_RISK_REDUCING");

    error Unauthorized();
    error ZeroAddress();
    error InvalidPolicy();

    event PolicyConfigured(address indexed account, bool enabled, uint256 adapterCount);
    event AssetLimitConfigured(address indexed account, address indexed asset, uint256 maxAbsNetUsd);

    constructor(address engine_) {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = RiskEngine(engine_);
    }

    modifier onlyAccountOwner(address account) {
        if (account == address(0) || ICLAccountOwner(account).owner() != msg.sender) revert Unauthorized();
        _;
    }

    function configure(address account, RiskTypes.Policy calldata policy_, address[] calldata adapters_)
        external
        onlyAccountOwner(account)
    {
        if (policy_.enabled && adapters_.length == 0) revert InvalidPolicy();

        address[] storage old = _adapters[account];
        for (uint256 i; i < old.length; ++i) {
            _covered[account][old[i]] = false;
        }
        delete _adapters[account];

        for (uint256 i; i < adapters_.length; ++i) {
            address adapter = adapters_[i];
            if (adapter == address(0) || _covered[account][adapter]) revert InvalidPolicy();
            _covered[account][adapter] = true;
            _adapters[account].push(adapter);
        }

        _policy[account] = policy_;
        emit PolicyConfigured(account, policy_.enabled, adapters_.length);
    }

    function setAssetLimit(address account, address asset, uint256 maxAbsNetUsd)
        external
        onlyAccountOwner(account)
    {
        if (!_assetLimitTracked[account][asset]) {
            _assetLimitTracked[account][asset] = true;
            _limitedAssets[account].push(asset);
        }
        assetLimitUsd[account][asset] = maxAbsNetUsd;
        emit AssetLimitConfigured(account, asset, maxAbsNetUsd);
    }

    function policy(address account) external view returns (RiskTypes.Policy memory) {
        return _policy[account];
    }

    function adapters(address account) external view returns (address[] memory) {
        return _adapters[account];
    }

    function limitedAssets(address account) external view returns (address[] memory) {
        return _limitedAssets[account];
    }

    function isAdapterCovered(address account, address adapter) external view override returns (bool) {
        return _covered[account][adapter];
    }

    /// @notice Captures both aggregate metrics and per-asset net exposure for strict pre/post comparison.
    function capture(address account) external view override returns (bytes memory state) {
        RiskTypes.Policy memory p = _policy[account];
        if (!p.enabled) return bytes("");
        address[] memory configuredAdapters = _adapters[account];
        (RiskTypes.PortfolioMetrics memory metrics, RiskTypes.AssetExposure[] memory exposures) =
            engine.portfolio(account, configuredAdapters);
        return abi.encode(metrics, exposures);
    }

    function validateTransition(address account, bytes calldata beforeState)
        external
        view
        override
        returns (bool ok, bytes32 reason)
    {
        RiskTypes.Policy memory p = _policy[account];
        if (!p.enabled) return (true, REASON_POLICY_DISABLED);

        address[] memory configuredAdapters = _adapters[account];
        (RiskTypes.PortfolioMetrics memory afterMetrics, RiskTypes.AssetExposure[] memory afterExposures) =
            engine.portfolio(account, configuredAdapters);

        (ok, reason) = _passesPolicy(account, p, afterMetrics, afterExposures);
        if (ok) return (true, bytes32(0));

        if (!p.allowRiskReducingWhenBreached || beforeState.length == 0) return (false, reason);
        (
            RiskTypes.PortfolioMetrics memory beforeMetrics,
            RiskTypes.AssetExposure[] memory beforeExposures
        ) = abi.decode(beforeState, (RiskTypes.PortfolioMetrics, RiskTypes.AssetExposure[]));
        if (_isRiskReducing(beforeMetrics, afterMetrics, beforeExposures, afterExposures)) {
            return (true, bytes32(0));
        }
        return (false, REASON_NOT_RISK_REDUCING);
    }

    /// @notice Dedicated delegated-automation check: the post-state must be strictly safer.
    function validateRiskReduction(address account, bytes calldata beforeState)
        external
        view
        override
        returns (bool ok, bytes32 reason)
    {
        RiskTypes.Policy memory p = _policy[account];
        if (!p.enabled || beforeState.length == 0) return (false, REASON_POLICY_DISABLED);

        address[] memory configuredAdapters = _adapters[account];
        (RiskTypes.PortfolioMetrics memory afterMetrics, RiskTypes.AssetExposure[] memory afterExposures) =
            engine.portfolio(account, configuredAdapters);
        (
            RiskTypes.PortfolioMetrics memory beforeMetrics,
            RiskTypes.AssetExposure[] memory beforeExposures
        ) = abi.decode(beforeState, (RiskTypes.PortfolioMetrics, RiskTypes.AssetExposure[]));

        if (_isRiskReducing(beforeMetrics, afterMetrics, beforeExposures, afterExposures)) {
            return (true, bytes32(0));
        }
        return (false, REASON_NOT_RISK_REDUCING);
    }

    function check(address account)
        external
        view
        returns (
            bool ok,
            bytes32 reason,
            RiskTypes.PortfolioMetrics memory metrics,
            RiskTypes.AssetExposure[] memory exposures
        )
    {
        RiskTypes.Policy memory p = _policy[account];
        address[] memory configuredAdapters = _adapters[account];
        (metrics, exposures) = engine.portfolio(account, configuredAdapters);
        if (!p.enabled) return (true, REASON_POLICY_DISABLED, metrics, exposures);
        (ok, reason) = _passesPolicy(account, p, metrics, exposures);
    }

    function _passesPolicy(
        address account,
        RiskTypes.Policy memory p,
        RiskTypes.PortfolioMetrics memory m,
        RiskTypes.AssetExposure[] memory exposures
    ) internal view returns (bool, bytes32) {
        if (p.maxGrossExposureUsd != 0 && m.grossExposureUsd > p.maxGrossExposureUsd) {
            return (false, REASON_GROSS_EXPOSURE);
        }
        if (p.maxDebtUsd != 0 && m.debtUsd > p.maxDebtUsd) return (false, REASON_DEBT);
        if (p.maxLeverageE18 != 0 && m.leverageE18 > p.maxLeverageE18) return (false, REASON_LEVERAGE);
        if (p.maxMarginUtilizationE18 != 0 && m.marginUtilizationE18 > p.maxMarginUtilizationE18) {
            return (false, REASON_MARGIN_UTILIZATION);
        }
        if (p.minHealthE18 != 0 && m.healthE18 < p.minHealthE18) return (false, REASON_HEALTH);
        if (p.minCriticalMoveBps != 0 && m.criticalMoveBps < p.minCriticalMoveBps) {
            return (false, REASON_CRITICAL_MOVE);
        }

        address[] storage assets_ = _limitedAssets[account];
        for (uint256 i; i < assets_.length; ++i) {
            uint256 limit = assetLimitUsd[account][assets_[i]];
            if (limit == 0) continue;
            uint256 netAbs;
            for (uint256 j; j < exposures.length; ++j) {
                if (exposures[j].asset == assets_[i]) {
                    netAbs = _abs(exposures[j].netUsd);
                    break;
                }
            }
            if (netAbs > limit) return (false, REASON_ASSET_EXPOSURE);
        }
        return (true, bytes32(0));
    }

    /// @dev Strict delegated defense: no aggregate risk axis may worsen, no asset net exposure may worsen,
    ///      and at least one core solvency axis must improve.
    function _isRiskReducing(
        RiskTypes.PortfolioMetrics memory beforeMetrics,
        RiskTypes.PortfolioMetrics memory afterMetrics,
        RiskTypes.AssetExposure[] memory beforeExposures,
        RiskTypes.AssetExposure[] memory afterExposures
    ) internal pure returns (bool) {
        if (afterMetrics.maintenanceMarginUsd > beforeMetrics.maintenanceMarginUsd) return false;
        if (afterMetrics.initialMarginUsd > beforeMetrics.initialMarginUsd) return false;
        if (afterMetrics.grossExposureUsd > beforeMetrics.grossExposureUsd) return false;
        if (afterMetrics.directionalExposureUsd > beforeMetrics.directionalExposureUsd) return false;
        if (afterMetrics.debtUsd > beforeMetrics.debtUsd) return false;
        if (!_assetExposureNotWorse(beforeExposures, afterExposures)) return false;

        bool healthImproved = afterMetrics.healthE18 > beforeMetrics.healthE18;
        bool bufferImproved = afterMetrics.criticalMoveBps > beforeMetrics.criticalMoveBps;
        bool leverageImproved = afterMetrics.leverageE18 < beforeMetrics.leverageE18;
        bool marginImproved = afterMetrics.marginUtilizationE18 < beforeMetrics.marginUtilizationE18;
        bool debtImproved = afterMetrics.debtUsd < beforeMetrics.debtUsd;
        bool exposureImproved = afterMetrics.directionalExposureUsd < beforeMetrics.directionalExposureUsd;

        return healthImproved || bufferImproved || leverageImproved || marginImproved || debtImproved || exposureImproved;
    }

    function _assetExposureNotWorse(
        RiskTypes.AssetExposure[] memory beforeExposures,
        RiskTypes.AssetExposure[] memory afterExposures
    ) internal pure returns (bool) {
        for (uint256 i; i < afterExposures.length; ++i) {
            uint256 beforeAbs;
            for (uint256 j; j < beforeExposures.length; ++j) {
                if (beforeExposures[j].asset == afterExposures[i].asset) {
                    beforeAbs = _abs(beforeExposures[j].netUsd);
                    break;
                }
            }
            if (_abs(afterExposures[i].netUsd) > beforeAbs) return false;
        }
        return true;
    }

    function _abs(int256 value) internal pure returns (uint256) {
        if (value == type(int256).min) revert InvalidPolicy();
        return uint256(value < 0 ? -value : value);
    }
}
