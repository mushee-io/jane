// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLTypes} from "../types/CLTypes.sol";
import {RiskPolicyManager} from "../risk/RiskPolicyManager.sol";

interface ICLDefensiveAccount {
    function executeDefensiveBatch(CLTypes.AdapterAction[] calldata actions)
        external
        returns (bytes[][] memory results);
}

/// @title DefensiveExecutor
/// @notice Executes keeper-supplied defensive plans only when the CL account is policy-breached.
/// @dev CLAccount is the final safety boundary: this contract must first be authorized as a
///      defensive operator, and every submitted batch must strictly reduce risk or the entire
///      transaction reverts.
contract DefensiveExecutor {
    uint256 public constant MAX_ACTIONS = 8;

    address public owner;
    RiskPolicyManager public immutable policyManager;
    mapping(address keeper => bool allowed) public keeperAllowed;

    error Unauthorized();
    error ZeroAddress();
    error InvalidActionCount();
    error AccountNotBreached();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event KeeperPermissionChanged(address indexed keeper, bool allowed);
    event DefenseExecuted(address indexed keeper, address indexed account, bytes32 indexed breachReason, uint256 actionCount);

    constructor(address initialOwner, address policyManager_) {
        if (initialOwner == address(0) || policyManager_ == address(0)) revert ZeroAddress();
        owner = initialOwner;
        policyManager = RiskPolicyManager(policyManager_);
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyKeeper() {
        if (!keeperAllowed[msg.sender]) revert Unauthorized();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        if (keeper == address(0)) revert ZeroAddress();
        keeperAllowed[keeper] = allowed;
        emit KeeperPermissionChanged(keeper, allowed);
    }

    function executeDefense(address account, CLTypes.AdapterAction[] calldata actions)
        external
        onlyKeeper
        returns (bytes[][] memory results)
    {
        if (actions.length == 0 || actions.length > MAX_ACTIONS) revert InvalidActionCount();
        (bool ok, bytes32 reason,,) = policyManager.check(account);
        if (ok) revert AccountNotBreached();

        results = ICLDefensiveAccount(account).executeDefensiveBatch(actions);
        emit DefenseExecuted(msg.sender, account, reason, actions.length);
    }
}
