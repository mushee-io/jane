// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPriceSource} from "../interfaces/IPriceSource.sol";
import {RiskTypes} from "../types/RiskTypes.sol";

/// @title RiskRegistry
/// @notice Canonical valuation and margin configuration for CL risk calculations.
/// @dev Price reads fail closed on missing, zero, future-dated or stale observations.
contract RiskRegistry {
    address public owner;

    mapping(address asset => RiskTypes.AssetConfig config) private _assetConfig;
    mapping(bytes32 instrumentId => RiskTypes.InstrumentConfig config) private _instrumentConfig;

    error Unauthorized();
    error ZeroAddress();
    error InvalidConfig();
    error AssetNotConfigured(address asset);
    error InstrumentNotConfigured(bytes32 instrumentId);
    error InvalidPrice(address asset);
    error StalePrice(address asset, uint256 updatedAt);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AssetConfigured(address indexed asset, address indexed priceSource, uint8 decimals);
    event InstrumentConfigured(bytes32 indexed instrumentId, address indexed underlyingAsset, address collateralAsset);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setAssetConfig(address asset, RiskTypes.AssetConfig calldata config) external onlyOwner {
        if (config.enabled) {
            if (config.priceSource == address(0) || config.maxStaleness == 0 || config.decimals > 36) {
                revert InvalidConfig();
            }
            if (
                config.maintenanceMarginBps > config.initialMarginBps
                    || config.initialMarginBps > RiskTypes.BPS
                    || config.hedgeMarginBps > RiskTypes.BPS
                    || config.stressBps > RiskTypes.BPS
            ) revert InvalidConfig();
        }
        _assetConfig[asset] = config;
        emit AssetConfigured(asset, config.priceSource, config.decimals);
    }

    function setInstrumentConfig(bytes32 instrumentId, RiskTypes.InstrumentConfig calldata config) external onlyOwner {
        if (config.enabled) {
            if (config.exposureDecimals > 36 || config.collateralDecimals > 36 || config.pnlDecimals > 36) {
                revert InvalidConfig();
            }
            if (!_assetConfig[config.underlyingAsset].enabled || !_assetConfig[config.collateralAsset].enabled) {
                revert InvalidConfig();
            }
        }
        _instrumentConfig[instrumentId] = config;
        emit InstrumentConfigured(instrumentId, config.underlyingAsset, config.collateralAsset);
    }

    function getAssetConfig(address asset) external view returns (RiskTypes.AssetConfig memory) {
        return _assetConfig[asset];
    }

    function getInstrumentConfig(bytes32 instrumentId)
        external
        view
        returns (RiskTypes.InstrumentConfig memory)
    {
        return _instrumentConfig[instrumentId];
    }

    function requireAssetConfig(address asset) public view returns (RiskTypes.AssetConfig memory config) {
        config = _assetConfig[asset];
        if (!config.enabled) revert AssetNotConfigured(asset);
    }

    function requireInstrumentConfig(bytes32 instrumentId)
        external
        view
        returns (RiskTypes.InstrumentConfig memory config)
    {
        config = _instrumentConfig[instrumentId];
        if (!config.enabled) revert InstrumentNotConfigured(instrumentId);
    }

    function priceE18(address asset) public view returns (uint256 price) {
        RiskTypes.AssetConfig memory config = requireAssetConfig(asset);
        uint256 updatedAt;
        (price, updatedAt) = IPriceSource(config.priceSource).latestPriceE18();
        if (price == 0 || updatedAt == 0 || updatedAt > block.timestamp) revert InvalidPrice(asset);
        if (block.timestamp - updatedAt > config.maxStaleness) revert StalePrice(asset, updatedAt);
    }
}
