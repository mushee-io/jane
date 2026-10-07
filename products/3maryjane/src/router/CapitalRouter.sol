// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAdapterRegistry} from "../interfaces/IAdapterRegistry.sol";

/// @title CapitalRouter
/// @notice Deterministically ranks same-input route quotes across active CL adapters.
/// @dev Routing scores are execution heuristics only. Final custody, target allowlists and risk
///      policy enforcement remain inside CLAccount and RiskPolicyManager.
contract CapitalRouter {
    struct RouteQuote {
        bytes32 routeId;
        address adapter;
        uint256 inputUsd;
        uint256 outputUsd;
        uint256 gasUsd;
        uint256 riskPenaltyUsd;
        uint16 slippageBps;
        uint64 deadline;
    }

    IAdapterRegistry public immutable registry;

    error ZeroAddress();
    error InvalidInput();
    error NoRoute();

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IAdapterRegistry(registry_);
    }

    /// @notice Select the route with the highest conservative net value after gas/risk penalties.
    /// @dev All considered routes must quote the same requested input amount.
    function selectBest(
        RouteQuote[] calldata quotes,
        uint256 requestedInputUsd,
        uint256 minOutputUsd,
        uint16 maxSlippageBps
    ) external view returns (uint256 index, RouteQuote memory quote, uint256 netValueUsd) {
        if (requestedInputUsd == 0) revert InvalidInput();

        bool found;
        uint256 bestNet;
        uint16 bestSlippage = type(uint16).max;

        for (uint256 i; i < quotes.length; ++i) {
            RouteQuote calldata candidate = quotes[i];
            if (candidate.inputUsd != requestedInputUsd) continue;
            if (candidate.outputUsd < minOutputUsd) continue;
            if (candidate.slippageBps > maxSlippageBps) continue;
            if (candidate.deadline < block.timestamp) continue;
            if (candidate.adapter == address(0) || !registry.isAdapterActive(candidate.adapter)) continue;

            uint256 costs = candidate.gasUsd + candidate.riskPenaltyUsd;
            if (costs >= candidate.outputUsd) continue;
            uint256 conservativeNet = candidate.outputUsd - costs;

            if (
                !found || conservativeNet > bestNet
                    || (conservativeNet == bestNet && candidate.slippageBps < bestSlippage)
            ) {
                found = true;
                index = i;
                quote = candidate;
                bestNet = conservativeNet;
                bestSlippage = candidate.slippageBps;
            }
        }

        if (!found) revert NoRoute();
        netValueUsd = bestNet;
    }
}
