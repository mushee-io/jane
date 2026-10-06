// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./JaneAgentWallet.sol";

/// @title JaneAgentWalletFactory
/// @notice Deploys budget-constrained agent wallets that settle inference through 33jane.
contract JaneAgentWalletFactory {
    address public immutable settlement;

    event AgentWalletCreated(address indexed owner, address indexed wallet, uint256 dailyLimit, uint256 perRequestLimit);

    constructor(address settlementContract) {
        require(settlementContract != address(0), "settlement");
        settlement = settlementContract;
    }

    function createAgentWallet(
        address owner,
        uint256 dailyLimit,
        uint256 perRequestLimit
    ) external returns (address wallet) {
        JaneAgentWallet deployed = new JaneAgentWallet(owner, settlement, dailyLimit, perRequestLimit);
        wallet = address(deployed);
        emit AgentWalletCreated(owner, wallet, dailyLimit, perRequestLimit);
    }
}
