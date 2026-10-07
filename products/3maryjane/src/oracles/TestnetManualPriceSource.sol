// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPriceSource} from "../interfaces/IPriceSource.sol";

/// @title TestnetManualPriceSource
/// @notice Owner-updatable price source for 3maryjane TESTNET DRY-RUNS ONLY.
/// @dev Never use this source for a production/mainnet deployment. It exists so the Monad
///      testnet UI can exercise portfolio valuation, policies and the solver without pretending
///      a production-grade oracle is available.
contract TestnetManualPriceSource is IPriceSource {
    address public owner;
    uint256 public priceE18;
    uint256 public updatedAt;

    error Unauthorized();
    error ZeroAddress();
    error InvalidPrice();

    event PriceUpdated(uint256 priceE18, uint256 updatedAt);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner, uint256 initialPriceE18) {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (initialPriceE18 == 0) revert InvalidPrice();
        owner = initialOwner;
        priceE18 = initialPriceE18;
        updatedAt = block.timestamp;
        emit OwnershipTransferred(address(0), initialOwner);
        emit PriceUpdated(initialPriceE18, block.timestamp);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setPriceE18(uint256 nextPriceE18) external onlyOwner {
        if (nextPriceE18 == 0) revert InvalidPrice();
        priceE18 = nextPriceE18;
        updatedAt = block.timestamp;
        emit PriceUpdated(nextPriceE18, block.timestamp);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function latestPriceE18() external view returns (uint256, uint256) {
        return (priceE18, updatedAt);
    }
}
