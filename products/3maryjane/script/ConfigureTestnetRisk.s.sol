// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {RiskRegistry} from "../src/risk/RiskRegistry.sol";
import {RiskTypes} from "../src/types/RiskTypes.sol";
import {TestnetManualPriceSource} from "../src/oracles/TestnetManualPriceSource.sol";

interface VmTestnetRisk {
    function envUint(string calldata) external returns (uint256);
    function envUint(string calldata, string calldata) external returns (uint256[] memory);
    function envAddress(string calldata) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice TESTNET ONLY. Configures manually-updatable prices so the risk UI can be exercised
///         without misrepresenting them as production oracle data.
contract ConfigureTestnetRisk {
    VmTestnetRisk internal constant vm =
        VmTestnetRisk(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 internal constant PERPL_PROTOCOL_ID = keccak256("PERPL");

    event TestnetRiskConfigured(
        address indexed underlying,
        address indexed collateral,
        address underlyingPriceSource,
        address collateralPriceSource
    );

    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        RiskRegistry registry = RiskRegistry(vm.envAddress("RISK_REGISTRY"));
        address underlying = vm.envAddress("RISK_UNDERLYING_ASSET");
        address collateral = vm.envAddress("RISK_COLLATERAL_ASSET");

        vm.startBroadcast(key);

        TestnetManualPriceSource underlyingSource =
            new TestnetManualPriceSource(deployer, vm.envUint("RISK_UNDERLYING_PRICE_E18"));
        TestnetManualPriceSource collateralSource =
            new TestnetManualPriceSource(deployer, vm.envUint("RISK_COLLATERAL_PRICE_E18"));

        registry.setAssetConfig(
            underlying,
            RiskTypes.AssetConfig({
                priceSource: address(underlyingSource),
                decimals: uint8(vm.envUint("RISK_UNDERLYING_DECIMALS")),
                initialMarginBps: uint16(vm.envUint("RISK_UNDERLYING_INITIAL_MARGIN_BPS")),
                maintenanceMarginBps: uint16(vm.envUint("RISK_UNDERLYING_MAINTENANCE_MARGIN_BPS")),
                hedgeMarginBps: uint16(vm.envUint("RISK_UNDERLYING_HEDGE_MARGIN_BPS")),
                stressBps: uint16(vm.envUint("RISK_UNDERLYING_STRESS_BPS")),
                maxStaleness: type(uint32).max,
                enabled: true
            })
        );

        registry.setAssetConfig(
            collateral,
            RiskTypes.AssetConfig({
                priceSource: address(collateralSource),
                decimals: uint8(vm.envUint("RISK_COLLATERAL_DECIMALS")),
                initialMarginBps: uint16(vm.envUint("RISK_COLLATERAL_INITIAL_MARGIN_BPS")),
                maintenanceMarginBps: uint16(vm.envUint("RISK_COLLATERAL_MAINTENANCE_MARGIN_BPS")),
                hedgeMarginBps: uint16(vm.envUint("RISK_COLLATERAL_HEDGE_MARGIN_BPS")),
                stressBps: uint16(vm.envUint("RISK_COLLATERAL_STRESS_BPS")),
                maxStaleness: type(uint32).max,
                enabled: true
            })
        );

        uint256[] memory perpIds = vm.envUint("PERPL_TRACKED_PERP_IDS", ",");
        RiskTypes.InstrumentConfig memory config = RiskTypes.InstrumentConfig({
            underlyingAsset: underlying,
            collateralAsset: collateral,
            exposureDecimals: uint8(vm.envUint("RISK_PERPL_EXPOSURE_DECIMALS")),
            collateralDecimals: uint8(vm.envUint("RISK_PERPL_COLLATERAL_DECIMALS")),
            pnlDecimals: uint8(vm.envUint("RISK_PERPL_PNL_DECIMALS")),
            enabled: true
        });

        for (uint256 i = 0; i < perpIds.length; ++i) {
            bytes32 instrumentId = keccak256(abi.encode(PERPL_PROTOCOL_ID, "PERP", perpIds[i]));
            registry.setInstrumentConfig(instrumentId, config);
        }

        emit TestnetRiskConfigured(underlying, collateral, address(underlyingSource), address(collateralSource));
        vm.stopBroadcast();
    }
}
