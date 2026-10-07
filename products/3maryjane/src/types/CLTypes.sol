// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library CLTypes {
    enum PositionType {
        CASH,
        SPOT,
        PERP,
        SUPPLY,
        DEBT,
        LP,
        OTHER
    }

    /// @notice A single low-level call to be executed by a CL account.
    struct Execution {
        address target;
        uint256 value;
        bytes data;
    }

    /// @notice One adapter action in a cross-protocol atomic batch.
    struct AdapterAction {
        address adapter;
        bytes action;
    }

    /// @notice Protocol-neutral position envelope.
    /// @dev Numeric fields remain in the source protocol's native units until a valuation
    ///      layer supplies prices/decimal normalization. `notional == 0` means deliberately
    ///      unvalued rather than zero economic value.
    struct Position {
        bytes32 protocolId;
        bytes32 instrumentId;
        address asset;
        PositionType positionType;
        int256 signedExposure;
        uint256 notional;
        uint256 collateral;
        uint256 debt;
        int256 pnl;
        bytes metadata;
    }
}
