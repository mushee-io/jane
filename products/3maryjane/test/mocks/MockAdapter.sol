// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../../src/interfaces/ICLAdapter.sol";
import {CLTypes} from "../../src/types/CLTypes.sol";

contract MockAdapter is ICLAdapter {
    bytes32 internal constant ID = keccak256("MOCK_LENDING");

    function protocolId() external pure returns (bytes32) {
        return ID;
    }

    /// action = abi.encode(token, protocol, amount)
    function buildExecution(address, bytes calldata action)
        external
        pure
        returns (CLTypes.Execution[] memory executions)
    {
        (address token, address protocol, uint256 amount) = abi.decode(action, (address, address, uint256));
        executions = new CLTypes.Execution[](2);
        executions[0] = CLTypes.Execution({
            target: token,
            value: 0,
            data: abi.encodeWithSignature("approve(address,uint256)", protocol, amount)
        });
        executions[1] = CLTypes.Execution({
            target: protocol,
            value: 0,
            data: abi.encodeWithSignature("supply(address,uint256)", token, amount)
        });
    }

    function getPositions(address account)
        external
        view
        returns (CLTypes.Position[] memory positions)
    {
        account;
        positions = new CLTypes.Position[](0);
    }
}
