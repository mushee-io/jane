// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IKuruMarginAccount {
    function deposit(address user, address token, uint256 amount) external payable;
    function withdraw(uint256 amount, address token) external;
    function batchWithdrawMaxTokens(address[] calldata tokens) external;
    function getBalance(address user, address token) external view returns (uint256);
}

interface IKuruOrderBook {
    function addBuyOrder(uint32 price, uint96 size, bool postOnly) external;
    function addSellOrder(uint32 price, uint96 size, bool postOnly) external;
    function placeAndExecuteMarketBuy(uint96 quoteSize, uint96 minOut, bool isMargin, bool isFOK) external payable;
    function placeAndExecuteMarketSell(uint96 size, uint96 minOut, bool isMargin, bool isFOK) external payable;
    function batchCancelOrders(uint40[] calldata orderIds) external;
    function batchCancelFlipOrders(uint40[] calldata orderIds) external;
    function bestBidAsk() external view returns (uint32 bestBid, uint32 bestAsk);
}
