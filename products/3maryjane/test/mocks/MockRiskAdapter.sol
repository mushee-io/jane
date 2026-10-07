// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../../src/interfaces/ICLAdapter.sol";
import {CLTypes} from "../../src/types/CLTypes.sol";

contract MockRiskAdapter is ICLAdapter {
    bytes32 public immutable id;
    address public immutable asset;
    bytes32 public immutable instrumentId;
    CLTypes.PositionType public immutable positionType;

    struct State {
        int256 signedExposure;
        uint256 collateral;
        uint256 debt;
        int256 pnl;
    }

    mapping(address account => State) public state;

    constructor(bytes32 id_, address asset_, bytes32 instrumentId_, CLTypes.PositionType positionType_) {
        id = id_;
        asset = asset_;
        instrumentId = instrumentId_;
        positionType = positionType_;
    }

    function protocolId() external view returns (bytes32) {
        return id;
    }

    /// @dev action = abi.encode(signedExposure, collateral, debt, pnl)
    function buildExecution(address account, bytes calldata action)
        external
        view
        returns (CLTypes.Execution[] memory executions)
    {
        (int256 exposure, uint256 collateral_, uint256 debt_, int256 pnl_) =
            abi.decode(action, (int256, uint256, uint256, int256));
        executions = new CLTypes.Execution[](1);
        executions[0] = CLTypes.Execution({
            target: address(this),
            value: 0,
            data: abi.encodeCall(this.applyPosition, (account, exposure, collateral_, debt_, pnl_))
        });
    }

    function applyPosition(address account, int256 exposure, uint256 collateral_, uint256 debt_, int256 pnl_)
        external
    {
        require(msg.sender == account, "ONLY_ACCOUNT");
        state[account] = State(exposure, collateral_, debt_, pnl_);
    }

    function seed(address account, int256 exposure, uint256 collateral_, uint256 debt_, int256 pnl_) external {
        state[account] = State(exposure, collateral_, debt_, pnl_);
    }

    function getPositions(address account) external view returns (CLTypes.Position[] memory positions) {
        State memory s = state[account];
        if (s.signedExposure == 0 && s.collateral == 0 && s.debt == 0 && s.pnl == 0) {
            return new CLTypes.Position[](0);
        }
        positions = new CLTypes.Position[](1);
        positions[0] = CLTypes.Position({
            protocolId: id,
            instrumentId: instrumentId,
            asset: asset,
            positionType: positionType,
            signedExposure: s.signedExposure,
            notional: 0,
            collateral: s.collateral,
            debt: s.debt,
            pnl: s.pnl,
            metadata: bytes("")
        });
    }
}
