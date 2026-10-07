// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../interfaces/ICLAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";
import {HashedCreditVault} from "../hashed/HashedCreditVault.sol";

interface IERC20ApproveHashed {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title HashedAdapter
/// @notice 3maryjane adapter for the Hashed stock-backed credit market.
contract HashedAdapter is ICLAdapter {
    bytes32 public constant override protocolId = keccak256("HASHED");

    enum Action {
        DEPOSIT,
        WITHDRAW,
        BORROW,
        REPAY
    }

    HashedCreditVault public immutable vault;
    address public immutable debtToken;

    error ZeroAddress();
    error InvalidAction();
    error AmountOverflow();

    constructor(address vault_) {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = HashedCreditVault(vault_);
        debtToken = address(vault.debtToken());
    }

    /// @dev action = abi.encode(uint8(Action), asset, amount)
    function buildExecution(address, bytes calldata action)
        external
        view
        override
        returns (CLTypes.Execution[] memory executions)
    {
        (uint8 actionType, address asset, uint256 amount) = abi.decode(action, (uint8, address, uint256));
        if (actionType > uint8(Action.REPAY)) revert InvalidAction();

        if (Action(actionType) == Action.DEPOSIT) {
            executions = new CLTypes.Execution[](2);
            executions[0] = CLTypes.Execution({
                target: asset,
                value: 0,
                data: abi.encodeWithSelector(IERC20ApproveHashed.approve.selector, address(vault), amount)
            });
            executions[1] = CLTypes.Execution({
                target: address(vault),
                value: 0,
                data: abi.encodeWithSelector(vault.deposit.selector, asset, amount)
            });
        } else if (Action(actionType) == Action.WITHDRAW) {
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(vault),
                value: 0,
                data: abi.encodeWithSelector(vault.withdraw.selector, asset, amount)
            });
        } else if (Action(actionType) == Action.BORROW) {
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(vault),
                value: 0,
                data: abi.encodeWithSelector(vault.borrow.selector, amount)
            });
        } else {
            executions = new CLTypes.Execution[](2);
            executions[0] = CLTypes.Execution({
                target: debtToken,
                value: 0,
                data: abi.encodeWithSelector(IERC20ApproveHashed.approve.selector, address(vault), amount)
            });
            executions[1] = CLTypes.Execution({
                target: address(vault),
                value: 0,
                data: abi.encodeWithSelector(vault.repay.selector, amount)
            });
        }
    }

    function getPositions(address account)
        external
        view
        override
        returns (CLTypes.Position[] memory positions)
    {
        uint256 assetCount = vault.supportedAssetCount();
        uint256 count;

        for (uint256 i; i < assetCount; ++i) {
            address asset = vault.supportedAssetAt(i);
            if (vault.collateralOf(account, asset) != 0) ++count;
        }
        if (vault.debtOf(account) != 0) ++count;

        positions = new CLTypes.Position[](count);
        uint256 cursor;

        for (uint256 i; i < assetCount; ++i) {
            address asset = vault.supportedAssetAt(i);
            uint256 amount = vault.collateralOf(account, asset);
            if (amount == 0) continue;
            if (amount > uint256(type(int256).max)) revert AmountOverflow();

            positions[cursor++] = CLTypes.Position({
                protocolId: protocolId,
                instrumentId: keccak256(abi.encodePacked("HASHED_COLLATERAL", asset)),
                asset: asset,
                positionType: CLTypes.PositionType.SUPPLY,
                signedExposure: int256(amount),
                notional: 0,
                collateral: 0,
                debt: 0,
                pnl: 0,
                metadata: abi.encode(address(vault))
            });
        }

        uint256 debt = vault.debtOf(account);
        if (debt != 0) {
            if (debt > uint256(type(int256).max)) revert AmountOverflow();
            positions[cursor] = CLTypes.Position({
                protocolId: protocolId,
                instrumentId: keccak256("HASHED_DEBT"),
                asset: debtToken,
                positionType: CLTypes.PositionType.DEBT,
                signedExposure: -int256(debt),
                notional: 0,
                collateral: 0,
                debt: debt,
                pnl: 0,
                metadata: abi.encode(address(vault))
            });
        }
    }
}
