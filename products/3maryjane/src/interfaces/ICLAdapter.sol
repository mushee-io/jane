// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLTypes} from "../types/CLTypes.sol";

interface ICLAdapter {
    function protocolId() external view returns (bytes32);

    /// @notice Convert a high-level adapter action into calls the CL account will execute directly.
    /// @dev This function MUST NOT mutate state. The CL account remains msg.sender to each target.
    function buildExecution(address account, bytes calldata action)
        external
        view
        returns (CLTypes.Execution[] memory executions);

    /// @notice Normalize positions owned by `account` on the integrated protocol.
    function getPositions(address account) external view returns (CLTypes.Position[] memory positions);
}
