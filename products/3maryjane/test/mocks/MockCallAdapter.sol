// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../../src/interfaces/ICLAdapter.sol";
import {CLTypes} from "../../src/types/CLTypes.sol";

/// @dev Deliberately dangerous adapter used only to verify registry call permissions.
contract MockCallAdapter is ICLAdapter {
    bytes32 internal constant ID = keccak256("MOCK_CALL_ADAPTER");

    function protocolId() external pure returns (bytes32) {
        return ID;
    }

    /// action = abi.encode(target, value, calldata)
    function buildExecution(address, bytes calldata action)
        external
        pure
        returns (CLTypes.Execution[] memory executions)
    {
        (address target, uint256 value, bytes memory data) = abi.decode(action, (address, uint256, bytes));
        executions = new CLTypes.Execution[](1);
        executions[0] = CLTypes.Execution({target: target, value: value, data: data});
    }

    function getPositions(address) external pure returns (CLTypes.Position[] memory positions) {
        positions = new CLTypes.Position[](0);
    }
}
