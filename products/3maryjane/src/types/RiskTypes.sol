// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library RiskTypes {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    struct AssetConfig {
        address priceSource;
        uint8 decimals;
        uint16 initialMarginBps;
        uint16 maintenanceMarginBps;
        uint16 hedgeMarginBps;
        uint16 stressBps;
        uint32 maxStaleness;
        bool enabled;
    }

    /// @notice Overrides how a protocol-specific instrument is interpreted by the risk engine.
    /// @dev Required for derivatives whose `Position.asset` is not the economic underlying.
    struct InstrumentConfig {
        address underlyingAsset;
        address collateralAsset;
        uint8 exposureDecimals;
        uint8 collateralDecimals;
        uint8 pnlDecimals;
        bool enabled;
    }

    struct ValuedPosition {
        bytes32 protocolId;
        bytes32 instrumentId;
        address underlyingAsset;
        address collateralAsset;
        uint8 positionType;
        int256 signedUsd;
        uint256 grossUsd;
        uint256 collateralUsd;
        uint256 debtUsd;
        int256 pnlUsd;
    }

    /// @notice Net risk bucket for one economic underlying across all integrated protocols.
    struct AssetExposure {
        address asset;
        int256 netUsd;
        uint256 grossUsd;
        uint256 hedgedPairUsd;
        uint256 initialMarginUsd;
        uint256 maintenanceMarginUsd;
    }

    struct PortfolioMetrics {
        uint256 assetsUsd;
        uint256 debtUsd;
        int256 equityUsd;
        int256 pnlUsd;
        uint256 grossExposureUsd;
        uint256 directionalExposureUsd;
        uint256 initialMarginUsd;
        uint256 maintenanceMarginUsd;
        uint256 leverageE18;
        uint256 healthE18;
        uint256 marginUtilizationE18;
        uint256 criticalMoveBps;
    }

    struct StressResult {
        int256 pnlUsd;
        int256 stressedEquityUsd;
        uint256 stressedHealthE18;
        uint256 lossUsd;
    }

    struct Shock {
        address asset;
        int32 shockBps;
    }

    struct Policy {
        bool enabled;
        bool allowRiskReducingWhenBreached;
        uint256 maxGrossExposureUsd;
        uint256 maxDebtUsd;
        uint256 maxLeverageE18;
        uint256 maxMarginUtilizationE18;
        uint256 minHealthE18;
        uint16 minCriticalMoveBps;
    }
}
