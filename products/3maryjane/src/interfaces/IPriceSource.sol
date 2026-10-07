// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPriceSource {
    /// @notice Return a positive price normalized to 1e18 plus its source timestamp.
    function latestPriceE18() external view returns (uint256 priceE18, uint256 updatedAt);
}
