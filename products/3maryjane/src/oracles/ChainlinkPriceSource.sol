// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPriceSource} from "../interfaces/IPriceSource.sol";

interface IChainlinkAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ChainlinkPriceSource
/// @notice Normalizes a Chainlink-compatible feed to the 1e18 convention used by CL.
contract ChainlinkPriceSource is IPriceSource {
    IChainlinkAggregatorV3 public immutable feed;
    uint8 public immutable feedDecimals;

    error ZeroAddress();
    error InvalidDecimals();
    error InvalidAnswer();
    error IncompleteRound();

    constructor(address feed_) {
        if (feed_ == address(0)) revert ZeroAddress();
        feed = IChainlinkAggregatorV3(feed_);
        uint8 decimals_ = IChainlinkAggregatorV3(feed_).decimals();
        if (decimals_ > 36) revert InvalidDecimals();
        feedDecimals = decimals_;
    }

    function latestPriceE18() external view returns (uint256 priceE18, uint256 updatedAt) {
        (uint80 roundId, int256 answer,, uint256 timestamp, uint80 answeredInRound) = feed.latestRoundData();
        if (answer <= 0) revert InvalidAnswer();
        if (timestamp == 0 || answeredInRound < roundId) revert IncompleteRound();

        uint256 unsigned = uint256(answer);
        if (feedDecimals == 18) priceE18 = unsigned;
        else if (feedDecimals < 18) priceE18 = unsigned * (10 ** uint256(18 - feedDecimals));
        else priceE18 = unsigned / (10 ** uint256(feedDecimals - 18));
        updatedAt = timestamp;
    }
}
