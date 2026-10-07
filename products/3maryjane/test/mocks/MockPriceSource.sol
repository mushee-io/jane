// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPriceSource} from "../../src/interfaces/IPriceSource.sol";

contract MockPriceSource is IPriceSource {
    uint256 public priceE18;
    uint256 public updatedAt;

    constructor(uint256 price_) {
        priceE18 = price_;
        updatedAt = block.timestamp;
    }

    function set(uint256 price_, uint256 updatedAt_) external {
        priceE18 = price_;
        updatedAt = updatedAt_;
    }

    function latestPriceE18() external view returns (uint256, uint256) {
        return (priceE18, updatedAt);
    }
}
