// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseAdapter} from "./BaseAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {IEulerVault, IEulerEVC} from "../interfaces/protocols/IEuler.sol";

/// @title EulerAdapter
/// @notice Euler v2 lending adapter for CL accounts on Monad.
contract EulerAdapter is BaseAdapter {
    bytes32 public constant PROTOCOL_ID = keccak256("EULER_V2");

    enum ActionKind {
        ENABLE_COLLATERAL,
        DISABLE_COLLATERAL,
        ENABLE_CONTROLLER,
        DISABLE_CONTROLLER,
        SUPPLY,
        WITHDRAW,
        BORROW,
        REPAY
    }

    IEulerEVC public immutable evc;
    address[] private _trackedVaults;

    error ZeroAddress();
    error InvalidAmount();
    error AmountOverflow();
    error InvalidAction();

    constructor(address evc_, address[] memory trackedVaults_) BaseAdapter(PROTOCOL_ID) {
        if (evc_ == address(0)) revert ZeroAddress();
        evc = IEulerEVC(evc_);
        _trackedVaults = trackedVaults_;
    }

    function trackedVaults() external view returns (address[] memory) {
        return _trackedVaults;
    }

    /// @dev action = abi.encode(ActionKind, payload)
    /// ENABLE/DISABLE collateral/controller: abi.encode(vault)
    /// SUPPLY/WITHDRAW/BORROW/REPAY: abi.encode(vault, amount)
    function buildExecution(address account, bytes calldata action)
        external
        view
        override
        returns (CLTypes.Execution[] memory executions)
    {
        (ActionKind kind, bytes memory payload) = abi.decode(action, (ActionKind, bytes));

        if (kind == ActionKind.ENABLE_COLLATERAL || kind == ActionKind.DISABLE_COLLATERAL) {
            address vault = abi.decode(payload, (address));
            if (vault == address(0)) revert ZeroAddress();
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(evc),
                value: 0,
                data: kind == ActionKind.ENABLE_COLLATERAL
                    ? abi.encodeCall(IEulerEVC.enableCollateral, (account, vault))
                    : abi.encodeCall(IEulerEVC.disableCollateral, (account, vault))
            });
            return executions;
        }

        if (kind == ActionKind.ENABLE_CONTROLLER) {
            address vault = abi.decode(payload, (address));
            if (vault == address(0)) revert ZeroAddress();
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(evc),
                value: 0,
                data: abi.encodeCall(IEulerEVC.enableController, (account, vault))
            });
            return executions;
        }

        if (kind == ActionKind.DISABLE_CONTROLLER) {
            executions = new CLTypes.Execution[](1);
            executions[0] = CLTypes.Execution({
                target: address(evc),
                value: 0,
                data: abi.encodeCall(IEulerEVC.disableController, (account))
            });
            return executions;
        }

        (address vault, uint256 amount) = abi.decode(payload, (address, uint256));
        if (vault == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        IEulerVault eVault = IEulerVault(vault);

        if (kind == ActionKind.SUPPLY || kind == ActionKind.REPAY) {
            address token = eVault.asset();
            bytes memory vaultCall = kind == ActionKind.SUPPLY
                ? abi.encodeCall(IEulerVault.deposit, (amount, account))
                : abi.encodeCall(IEulerVault.repay, (amount, account));
            return _approveThenCall(token, vault, amount, vault, vaultCall);
        }

        executions = new CLTypes.Execution[](1);
        if (kind == ActionKind.WITHDRAW) {
            executions[0] = CLTypes.Execution({
                target: vault,
                value: 0,
                data: abi.encodeCall(IEulerVault.withdraw, (amount, account, account))
            });
            return executions;
        }

        if (kind == ActionKind.BORROW) {
            executions[0] = CLTypes.Execution({
                target: vault,
                value: 0,
                data: abi.encodeCall(IEulerVault.borrow, (amount, account))
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
        positions = new CLTypes.Position[](_trackedVaults.length * 2);
        uint256 count;

        for (uint256 i; i < _trackedVaults.length; ++i) {
            address vaultAddress = _trackedVaults[i];
            IEulerVault vault = IEulerVault(vaultAddress);
            address asset;
            try vault.asset() returns (address a) {
                asset = a;
            } catch {
                continue;
            }

            uint256 supplyAssets;
            try vault.balanceOf(account) returns (uint256 shares) {
                if (shares != 0) {
                    try vault.convertToAssets(shares) returns (uint256 assets) {
                        supplyAssets = assets;
                    } catch {}
                }
            } catch {}

            uint256 debt;
            try vault.debtOf(account) returns (uint256 d) {
                debt = d;
            } catch {}

            bool collateralEnabled;
            bool controllerEnabled;
            try evc.isCollateralEnabled(account, vaultAddress) returns (bool enabled) {
                collateralEnabled = enabled;
            } catch {}
            try evc.isControllerEnabled(account, vaultAddress) returns (bool enabled) {
                controllerEnabled = enabled;
            } catch {}

            if (supplyAssets != 0) {
                positions[count++] = CLTypes.Position({
                    protocolId: PROTOCOL_ID,
                    instrumentId: keccak256(abi.encode(PROTOCOL_ID, "SUPPLY", vaultAddress)),
                    asset: asset,
                    positionType: CLTypes.PositionType.SUPPLY,
                    signedExposure: _toInt(supplyAssets),
                    notional: 0,
                    collateral: collateralEnabled ? supplyAssets : 0,
                    debt: 0,
                    pnl: 0,
                    metadata: abi.encode(vaultAddress, collateralEnabled, controllerEnabled)
                });
            }

            if (debt != 0) {
                positions[count++] = CLTypes.Position({
                    protocolId: PROTOCOL_ID,
                    instrumentId: keccak256(abi.encode(PROTOCOL_ID, "DEBT", vaultAddress)),
                    asset: asset,
                    positionType: CLTypes.PositionType.DEBT,
                    signedExposure: -_toInt(debt),
                    notional: 0,
                    collateral: 0,
                    debt: debt,
                    pnl: 0,
                    metadata: abi.encode(vaultAddress, collateralEnabled, controllerEnabled)
                });
            }
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
