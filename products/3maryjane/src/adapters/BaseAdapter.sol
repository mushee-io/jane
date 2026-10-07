// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../interfaces/ICLAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";

abstract contract BaseAdapter is ICLAdapter {
    bytes32 private immutable _protocolId;

    constructor(bytes32 protocolId_) {
        _protocolId = protocolId_;
    }

    function protocolId() external view returns (bytes32) {
        return _protocolId;
    }

    function buildExecution(address account, bytes calldata action)
        external
        view
        virtual
        returns (CLTypes.Execution[] memory executions);

    function getPositions(address account)
        external
        view
        virtual
        returns (CLTypes.Position[] memory positions);
}
