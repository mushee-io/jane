// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICLAdapter} from "../interfaces/ICLAdapter.sol";
import {CLTypes} from "../types/CLTypes.sol";

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @title WalletBalanceAdapter
/// @notice Read-only position source for assets held directly by a CLAccount.
/// @dev This closes the risk-accounting gap between venue positions and free collateral/cash.
contract WalletBalanceAdapter is ICLAdapter {
    bytes32 public constant PROTOCOL_ID = keccak256("CL_FREE_COLLATERAL");

    address public owner;
    address[] private _assets;
    mapping(address asset => bool tracked) public isTracked;

    error Unauthorized();
    error ZeroAddress();
    error SourceOnly();
    error BalanceReadFailed(address asset);

    event AssetTrackingChanged(address indexed asset, bool tracked);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addAsset(address asset) external onlyOwner {
        if (isTracked[asset]) return;
        isTracked[asset] = true;
        _assets.push(asset);
        emit AssetTrackingChanged(asset, true);
    }

    /// @dev Removal leaves a tombstone in the enumeration to avoid O(n) storage shifts.
    function removeAsset(address asset) external onlyOwner {
        if (!isTracked[asset]) return;
        isTracked[asset] = false;
        emit AssetTrackingChanged(asset, false);
    }

    function assets() external view returns (address[] memory) {
        return _assets;
    }

    function protocolId() external pure returns (bytes32) {
        return PROTOCOL_ID;
    }

    function buildExecution(address, bytes calldata)
        external
        pure
        returns (CLTypes.Execution[] memory)
    {
        revert SourceOnly();
    }

    function getPositions(address account)
        external
        view
        returns (CLTypes.Position[] memory positions)
    {
        positions = new CLTypes.Position[](_assets.length);
        uint256 count;

        for (uint256 i; i < _assets.length; ++i) {
            address asset = _assets[i];
            if (!isTracked[asset]) continue;

            uint256 balance;
            if (asset == address(0)) {
                balance = account.balance;
            } else {
                (bool ok, bytes memory data) =
                    asset.staticcall(abi.encodeCall(IERC20Balance.balanceOf, (account)));
                if (!ok || data.length < 32) revert BalanceReadFailed(asset);
                balance = abi.decode(data, (uint256));
            }
            if (balance == 0) continue;

            positions[count++] = CLTypes.Position({
                protocolId: PROTOCOL_ID,
                instrumentId: keccak256(abi.encode(PROTOCOL_ID, "CASH", asset)),
                asset: asset,
                positionType: CLTypes.PositionType.CASH,
                signedExposure: _toInt(balance),
                notional: 0,
                collateral: balance,
                debt: 0,
                pnl: 0,
                metadata: bytes("")
            });
        }

        assembly {
            mstore(positions, count)
        }
    }

    function _toInt(uint256 value) internal pure returns (int256) {
        require(value <= uint256(type(int256).max), "AMOUNT_OVERFLOW");
        return int256(value);
    }
}
