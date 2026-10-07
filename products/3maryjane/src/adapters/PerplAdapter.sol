// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseAdapter} from "./BaseAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {IPerplExchange} from "../interfaces/protocols/IPerpl.sol";

/// @title PerplAdapter
/// @notice Direct on-chain Perpl account, collateral, and order execution for CL accounts.
contract PerplAdapter is BaseAdapter {
    bytes32 public constant PROTOCOL_ID = keccak256("PERPL");

    enum ActionKind {
        CREATE_ACCOUNT,
        DEPOSIT_COLLATERAL,
        WITHDRAW_COLLATERAL,
        ALLOW_FORWARDING,
        EXEC_ORDER,
        EXEC_ORDERS,
        EXEC_ORDER_V2,
        EXEC_ORDERS_V2
    }

    IPerplExchange public immutable exchange;
    address public immutable collateralToken;
    uint256[] private _trackedPerpIds;

    error ZeroAddress();
    error InvalidAmount();
    error AmountOverflow();
    error InvalidAction();
    error AccountReadFailed(bytes reason);

    bytes4 internal constant ACCOUNT_DOES_NOT_EXIST_SELECTOR = bytes4(keccak256("AccountDoesNotExist(address)"));

    constructor(address exchange_, address collateralToken_, uint256[] memory trackedPerpIds_)
        BaseAdapter(PROTOCOL_ID)
    {
        if (exchange_ == address(0) || collateralToken_ == address(0)) revert ZeroAddress();
        exchange = IPerplExchange(exchange_);
        collateralToken = collateralToken_;
        _trackedPerpIds = trackedPerpIds_;
    }

    function trackedPerpIds() external view returns (uint256[] memory) {
        return _trackedPerpIds;
    }

    /// @dev action = abi.encode(ActionKind, payload)
    function buildExecution(address, bytes calldata action)
        external
        view
        override
        returns (CLTypes.Execution[] memory executions)
    {
        (ActionKind kind, bytes memory payload) = abi.decode(action, (ActionKind, bytes));

        if (kind == ActionKind.CREATE_ACCOUNT || kind == ActionKind.DEPOSIT_COLLATERAL) {
            uint256 amount = abi.decode(payload, (uint256));
            if (amount == 0) revert InvalidAmount();
            bytes memory exchangeCall = kind == ActionKind.CREATE_ACCOUNT
                ? abi.encodeCall(IPerplExchange.createAccount, (amount))
                : abi.encodeCall(IPerplExchange.depositCollateral, (amount));
            return _approveThenCall(collateralToken, address(exchange), amount, address(exchange), exchangeCall);
        }

        executions = new CLTypes.Execution[](1);

        if (kind == ActionKind.WITHDRAW_COLLATERAL) {
            uint256 amount = abi.decode(payload, (uint256));
            if (amount == 0) revert InvalidAmount();
            executions[0] = CLTypes.Execution({
                target: address(exchange),
                value: 0,
                data: abi.encodeCall(IPerplExchange.withdrawCollateral, (amount))
            });
            return executions;
        }

        if (kind == ActionKind.ALLOW_FORWARDING) {
            bool allow = abi.decode(payload, (bool));
            executions[0] = CLTypes.Execution({
                target: address(exchange),
                value: 0,
                data: abi.encodeCall(IPerplExchange.allowOrderForwarding, (allow))
            });
            return executions;
        }

        if (kind == ActionKind.EXEC_ORDER) {
            IPerplExchange.OrderDesc memory order = abi.decode(payload, (IPerplExchange.OrderDesc));
            executions[0] = CLTypes.Execution({
                target: address(exchange), value: 0, data: abi.encodeCall(IPerplExchange.execOrder, (order))
            });
            return executions;
        }

        if (kind == ActionKind.EXEC_ORDERS) {
            (IPerplExchange.OrderDesc[] memory orders, bool revertOnFail) =
                abi.decode(payload, (IPerplExchange.OrderDesc[], bool));
            executions[0] = CLTypes.Execution({
                target: address(exchange),
                value: 0,
                data: abi.encodeCall(IPerplExchange.execOrders, (orders, revertOnFail))
            });
            return executions;
        }

        if (kind == ActionKind.EXEC_ORDER_V2) {
            (IPerplExchange.OrderDesc memory order, bytes memory extension) =
                abi.decode(payload, (IPerplExchange.OrderDesc, bytes));
            executions[0] = CLTypes.Execution({
                target: address(exchange),
                value: 0,
                data: abi.encodeCall(IPerplExchange.execOrderV2, (order, extension))
            });
            return executions;
        }

        if (kind == ActionKind.EXEC_ORDERS_V2) {
            (IPerplExchange.OrderDesc[] memory orders, bool revertOnFail, bytes[] memory extensions) =
                abi.decode(payload, (IPerplExchange.OrderDesc[], bool, bytes[]));
            executions[0] = CLTypes.Execution({
                target: address(exchange),
                value: 0,
                data: abi.encodeCall(IPerplExchange.execOrdersV2, (orders, revertOnFail, extensions))
            });
            return executions;
        }

        revert InvalidAction();
    }

    /// @dev Configured Perpl reads deliberately fail closed. A deployment must create the Perpl
    ///      account and verify every tracked perp id before adding this adapter to an enforced risk policy.
    function getPositions(address account)
        external
        view
        override
        returns (CLTypes.Position[] memory positions)
    {
        IPerplExchange.AccountInfo memory info;
        try exchange.getAccountByAddr(account) returns (IPerplExchange.AccountInfo memory accountInfo) {
            info = accountInfo;
        } catch (bytes memory reason) {
            // A CL account that has not yet opened a Perpl exchange account has zero Perpl
            // positions. Treat only Perpl's explicit AccountDoesNotExist(address) error as empty;
            // every other read failure still fails closed.
            if (_revertSelector(reason) == ACCOUNT_DOES_NOT_EXIST_SELECTOR) {
                return new CLTypes.Position[](0);
            }
            revert AccountReadFailed(reason);
        }

        positions = new CLTypes.Position[](_trackedPerpIds.length + 1);
        uint256 count = 0;

        if (info.balanceCNS != 0 || info.lockedBalanceCNS != 0) {
            positions[count++] = CLTypes.Position({
                protocolId: PROTOCOL_ID,
                instrumentId: keccak256(abi.encode(PROTOCOL_ID, "COLLATERAL", collateralToken)),
                asset: collateralToken,
                positionType: CLTypes.PositionType.CASH,
                signedExposure: _toInt(info.balanceCNS),
                notional: info.balanceCNS,
                collateral: info.balanceCNS,
                debt: 0,
                pnl: 0,
                metadata: abi.encode(info.accountId, info.lockedBalanceCNS, info.frozen)
            });
        }

        for (uint256 i = 0; i < _trackedPerpIds.length; ++i) {
            uint256 perpId = _trackedPerpIds[i];
            (
                IPerplExchange.PositionInfoV2 memory p,
                uint256 markPricePNS,
                bool markPriceValid
            ) = exchange.getPositionV2(perpId, info.accountId);

            if (p.lotLNS == 0) continue;
            int256 size = _toInt(p.lotLNS);
            if (p.positionType == 1) size = -size;
            positions[count++] = CLTypes.Position({
                protocolId: PROTOCOL_ID,
                instrumentId: keccak256(abi.encode(PROTOCOL_ID, "PERP", perpId)),
                asset: address(0),
                positionType: CLTypes.PositionType.PERP,
                signedExposure: size,
                notional: 0,
                collateral: p.depositCNS,
                debt: 0,
                pnl: p.pnlCNS,
                metadata: abi.encode(
                    perpId,
                    p.positionType,
                    p.pricePNS,
                    p.priceResiduePNSQ16,
                    markPricePNS,
                    markPriceValid,
                    p.deltaPnlCNS,
                    p.premiumPnlCNS
                )
            });
        }

        assembly {
            mstore(positions, count)
        }
    }

    function _approveThenCall(
        address token,
        address spender,
        uint256 amount,
        address target,
        bytes memory callData
    ) internal pure returns (CLTypes.Execution[] memory executions) {
        executions = new CLTypes.Execution[](3);
        executions[0] = CLTypes.Execution({
            target: token,
            value: 0,
            data: abi.encodeCall(IERC20Minimal.approve, (spender, 0))
        });
        executions[1] = CLTypes.Execution({
            target: token,
            value: 0,
            data: abi.encodeCall(IERC20Minimal.approve, (spender, amount))
        });
        executions[2] = CLTypes.Execution({target: target, value: 0, data: callData});
    }

    function _revertSelector(bytes memory reason) internal pure returns (bytes4 selector) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            selector := mload(add(reason, 32))
        }
    }

    function _toInt(uint256 value) internal pure returns (int256) {
        if (value > uint256(type(int256).max)) revert AmountOverflow();
        return int256(value);
    }
}
