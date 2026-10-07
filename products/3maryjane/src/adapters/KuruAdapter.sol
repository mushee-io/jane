// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseAdapter} from "./BaseAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {IKuruMarginAccount, IKuruOrderBook} from "../interfaces/protocols/IKuru.sol";

/// @title KuruAdapter
/// @notice Executes Kuru margin-account funding and CLOB actions from the CL account.
contract KuruAdapter is BaseAdapter {
    bytes32 public constant PROTOCOL_ID = keccak256("KURU");

    enum ActionKind {
        DEPOSIT_MARGIN,
        WITHDRAW_MARGIN,
        MARKET_BUY,
        MARKET_SELL,
        LIMIT_BUY,
        LIMIT_SELL,
        CANCEL_ORDERS,
        CANCEL_FLIP_ORDERS
    }

    IKuruMarginAccount public immutable marginAccount;
    address[] private _trackedTokens;

    error ZeroAddress();
    error InvalidAmount();
    error AmountOverflow();
    error InvalidAction();

    constructor(address marginAccount_, address[] memory trackedTokens_) BaseAdapter(PROTOCOL_ID) {
        if (marginAccount_ == address(0)) revert ZeroAddress();
        marginAccount = IKuruMarginAccount(marginAccount_);
        _trackedTokens = trackedTokens_;
    }

    function trackedTokens() external view returns (address[] memory) {
        return _trackedTokens;
    }

    /// @dev action = abi.encode(ActionKind, payload)
    /// Payloads:
    /// DEPOSIT_MARGIN/WITHDRAW_MARGIN: abi.encode(token, amount)
    /// MARKET_BUY: abi.encode(market, quoteSize, minOut, fillOrKill)
    /// MARKET_SELL: abi.encode(market, size, minOut, fillOrKill)
    /// LIMIT_BUY/LIMIT_SELL: abi.encode(market, price, size, postOnly)
    /// CANCEL_*: abi.encode(market, uint40[] orderIds)
    function buildExecution(address account, bytes calldata action)
        external
        view
        override
        returns (CLTypes.Execution[] memory executions)
    {
        (ActionKind kind, bytes memory payload) = abi.decode(action, (ActionKind, bytes));

        if (kind == ActionKind.DEPOSIT_MARGIN) {
            (address token, uint256 amount) = abi.decode(payload, (address, uint256));
            if (amount == 0) revert InvalidAmount();
            if (token == address(0)) {
                executions = new CLTypes.Execution[](1);
                executions[0] = CLTypes.Execution({
                    target: address(marginAccount),
                    value: amount,
                    data: abi.encodeCall(IKuruMarginAccount.deposit, (account, token, amount))
                });
            } else {
                executions = _approveThenCall(
                    token,
                    address(marginAccount),
                    amount,
                    address(marginAccount),
                    abi.encodeCall(IKuruMarginAccount.deposit, (account, token, amount))
                );
            }
            return executions;
        }

        if (kind == ActionKind.WITHDRAW_MARGIN) {
            (address token, uint256 amount) = abi.decode(payload, (address, uint256));
            if (amount == 0) revert InvalidAmount();
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(marginAccount),
                value: 0,
                data: abi.encodeCall(IKuruMarginAccount.withdraw, (amount, token))
            });
            return executions;
        }

        if (kind == ActionKind.MARKET_BUY || kind == ActionKind.MARKET_SELL) {
            (address market, uint256 size, uint256 minOut, bool fillOrKill) =
                abi.decode(payload, (address, uint256, uint256, bool));
            if (market == address(0) || size == 0) revert InvalidAmount();
            if (size > type(uint96).max || minOut > type(uint96).max) revert AmountOverflow();
            executions = new CLTypes.Execution[](1);
            if (kind == ActionKind.MARKET_BUY) {
                executions[0] = CLTypes.Execution({
                    target: market,
                    value: 0,
                    data: abi.encodeCall(
                        IKuruOrderBook.placeAndExecuteMarketBuy,
                        (uint96(size), uint96(minOut), true, fillOrKill)
                    )
                });
            } else {
                executions[0] = CLTypes.Execution({
                    target: market,
                    value: 0,
                    data: abi.encodeCall(
                        IKuruOrderBook.placeAndExecuteMarketSell,
                        (uint96(size), uint96(minOut), true, fillOrKill)
                    )
                });
            }
            return executions;
        }

        if (kind == ActionKind.LIMIT_BUY || kind == ActionKind.LIMIT_SELL) {
            (address market, uint256 price, uint256 size, bool postOnly) =
                abi.decode(payload, (address, uint256, uint256, bool));
            if (market == address(0) || price == 0 || size == 0) revert InvalidAmount();
            if (price > type(uint32).max || size > type(uint96).max) revert AmountOverflow();
            executions = new CLTypes.Execution[](1);
            if (kind == ActionKind.LIMIT_BUY) {
                executions[0] = CLTypes.Execution({
                    target: market,
                    value: 0,
                    data: abi.encodeCall(IKuruOrderBook.addBuyOrder, (uint32(price), uint96(size), postOnly))
                });
            } else {
                executions[0] = CLTypes.Execution({
                    target: market,
                    value: 0,
                    data: abi.encodeCall(IKuruOrderBook.addSellOrder, (uint32(price), uint96(size), postOnly))
                });
            }
            return executions;
        }

        if (kind == ActionKind.CANCEL_ORDERS || kind == ActionKind.CANCEL_FLIP_ORDERS) {
            (address market, uint40[] memory orderIds) = abi.decode(payload, (address, uint40[]));
            if (market == address(0)) revert ZeroAddress();
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: market,
                value: 0,
                data: kind == ActionKind.CANCEL_ORDERS
                    ? abi.encodeCall(IKuruOrderBook.batchCancelOrders, (orderIds))
                    : abi.encodeCall(IKuruOrderBook.batchCancelFlipOrders, (orderIds))
            });
            return executions;
        }

        revert InvalidAction();
    }

    function getPositions(address account)
        external
        view
        override
        returns (CLTypes.Position[] memory positions)
    {
        positions = new CLTypes.Position[](_trackedTokens.length);
        uint256 count;
        for (uint256 i; i < _trackedTokens.length; ++i) {
            address token = _trackedTokens[i];
            uint256 balance = marginAccount.getBalance(account, token);
            if (balance == 0) continue;
            positions[count++] = CLTypes.Position({
                protocolId: PROTOCOL_ID,
                instrumentId: keccak256(abi.encode(PROTOCOL_ID, "MARGIN_BALANCE", token)),
                asset: token,
                positionType: CLTypes.PositionType.SPOT,
                signedExposure: _toInt(balance),
                notional: 0,
                collateral: balance,
                debt: 0,
                pnl: 0,
                metadata: abi.encode(address(marginAccount))
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

    function _toInt(uint256 value) internal pure returns (int256) {
        if (value > uint256(type(int256).max)) revert AmountOverflow();
        return int256(value);
    }
}
