// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {ChainlinkPriceSource} from "../src/oracles/ChainlinkPriceSource.sol";

interface VmRiskConfig {
    function envUint(string calldata) external returns (uint256);
    function envUint(string calldata, string calldata) external returns (uint256[] memory);
    function envAddress(string calldata) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @title ConfigureDemoRisk
/// @notice Configures the primary underlying/collateral pair and tracked Perpl instruments used by
///         the funded Metropolis flow. Values are explicit environment inputs rather than guessed
///         protocol defaults.
/// @dev Re-verify feed addresses, token decimals and Perpl unit conventions before every broadcast.
contract ConfigureDemoRisk {
    VmRiskConfig internal constant vm =
        VmRiskConfig(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 internal constant PERPL_PROTOCOL_ID = keccak256("PERPL");

    error InvalidUint8(string name, uint256 value);
    error InvalidUint16(string name, uint256 value);
    error InvalidUint32(string name, uint256 value);
    error EmptyPerpSet();
    error DuplicateAssetConfig();

    event DemoRiskConfigured(
        address indexed underlyingAsset,
        address indexed collateralAsset,
        address underlyingPriceSource,
        address collateralPriceSource,
        uint256 perpCount
    );

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        RiskRegistry registry = RiskRegistry(vm.envAddress("RISK_REGISTRY"));
        address underlying = vm.envAddress("RISK_UNDERLYING_ASSET");
        address collateral = vm.envAddress("RISK_COLLATERAL_ASSET");
        if (underlying == collateral) revert DuplicateAssetConfig();

        uint256[] memory perpIds = vm.envUint("PERPL_TRACKED_PERP_IDS", ",");
        if (perpIds.length == 0) revert EmptyPerpSet();

        vm.startBroadcast(key);
        address underlyingSource = _configureUnderlying(registry, underlying);
        address collateralSource = _configureCollateral(registry, collateral);
        _configurePerps(registry, underlying, collateral, perpIds);
        emit DemoRiskConfigured(underlying, collateral, underlyingSource, collateralSource, perpIds.length);
        vm.stopBroadcast();
    }

    function _configureUnderlying(RiskRegistry registry, address asset) internal returns (address source) {
        ChainlinkPriceSource priceSource = new ChainlinkPriceSource(vm.envAddress("RISK_UNDERLYING_FEED"));
        source = address(priceSource);
        registry.setAssetConfig(
            asset,
            RiskTypes.AssetConfig({
                priceSource: source,
                decimals: _u8("RISK_UNDERLYING_DECIMALS"),
                initialMarginBps: _u16("RISK_UNDERLYING_INITIAL_MARGIN_BPS"),
                maintenanceMarginBps: _u16("RISK_UNDERLYING_MAINTENANCE_MARGIN_BPS"),
                hedgeMarginBps: _u16("RISK_UNDERLYING_HEDGE_MARGIN_BPS"),
                stressBps: _u16("RISK_UNDERLYING_STRESS_BPS"),
                maxStaleness: _u32("RISK_UNDERLYING_MAX_STALENESS"),
                enabled: true
            })
        );
    }

    function _configureCollateral(RiskRegistry registry, address asset) internal returns (address source) {
        ChainlinkPriceSource priceSource = new ChainlinkPriceSource(vm.envAddress("RISK_COLLATERAL_FEED"));
        source = address(priceSource);
        registry.setAssetConfig(
            asset,
            RiskTypes.AssetConfig({
                priceSource: source,
                decimals: _u8("RISK_COLLATERAL_DECIMALS"),
                initialMarginBps: _u16("RISK_COLLATERAL_INITIAL_MARGIN_BPS"),
                maintenanceMarginBps: _u16("RISK_COLLATERAL_MAINTENANCE_MARGIN_BPS"),
                hedgeMarginBps: _u16("RISK_COLLATERAL_HEDGE_MARGIN_BPS"),
                stressBps: _u16("RISK_COLLATERAL_STRESS_BPS"),
                maxStaleness: _u32("RISK_COLLATERAL_MAX_STALENESS"),
                enabled: true
            })
        );
    }

    function _configurePerps(
        RiskRegistry registry,
        address underlying,
        address collateral,
        uint256[] memory perpIds
    ) internal {
        uint8 exposureDecimals = _u8("RISK_PERPL_EXPOSURE_DECIMALS");
        uint8 collateralDecimals = _u8("RISK_PERPL_COLLATERAL_DECIMALS");
        uint8 pnlDecimals = _u8("RISK_PERPL_PNL_DECIMALS");
        RiskTypes.InstrumentConfig memory config = RiskTypes.InstrumentConfig({
            underlyingAsset: underlying,
            collateralAsset: collateral,
            exposureDecimals: exposureDecimals,
            collateralDecimals: collateralDecimals,
            pnlDecimals: pnlDecimals,
            enabled: true
        });

        for (uint256 i = 0; i < perpIds.length; ++i) {
            bytes32 instrumentId = keccak256(abi.encode(PERPL_PROTOCOL_ID, "PERP", perpIds[i]));
            registry.setInstrumentConfig(instrumentId, config);
        }
    }

    function _u8(string memory name) internal returns (uint8 result) {
        uint256 value = vm.envUint(name);
        if (value > type(uint8).max) revert InvalidUint8(name, value);
        result = uint8(value);
    }

    function _u16(string memory name) internal returns (uint16 result) {
        uint256 value = vm.envUint(name);
        if (value > type(uint16).max) revert InvalidUint16(name, value);
        result = uint16(value);
    }

    function _u32(string memory name) internal returns (uint32 result) {
        uint256 value = vm.envUint(name);
        if (value > type(uint32).max) revert InvalidUint32(name, value);
        result = uint32(value);
    }
}
