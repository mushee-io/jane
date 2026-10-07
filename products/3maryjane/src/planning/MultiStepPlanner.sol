// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAdapterRegistry} from "../interfaces/IAdapterRegistry.sol";
import {CLTypes} from "../types/CLTypes.sol";

interface IPlannerAccountOwner {
    function owner() external view returns (address);
}

/// @title MultiStepPlanner
/// @notice Commits ordered cross-protocol CL action sequences to immutable hashes.
/// @dev Planning does not bypass CLAccount ownership. The owner still executes the committed
///      actions through CLAccount, where adapter permissions and post-state risk checks apply.
contract MultiStepPlanner {
    uint256 public constant MAX_STEPS = 16;

    enum Status {
        NONE,
        ACTIVE,
        CANCELLED,
        EXECUTED
    }

    struct Plan {
        address account;
        bytes32 intentId;
        bytes32 actionsHash;
        uint64 validUntil;
        uint16 stepCount;
        uint64 nonce;
        Status status;
    }

    IAdapterRegistry public immutable registry;
    mapping(address account => uint64 nextNonce) public nextNonce;
    mapping(bytes32 planId => Plan plan) private _plans;

    error Unauthorized();
    error ZeroAddress();
    error InvalidPlan();
    error InvalidStatus();
    error UnknownPlan();

    event PlanCreated(
        bytes32 indexed planId,
        address indexed account,
        bytes32 indexed intentId,
        bytes32 actionsHash,
        uint16 stepCount,
        uint64 validUntil
    );
    event PlanCancelled(bytes32 indexed planId);
    event PlanExecuted(bytes32 indexed planId);

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IAdapterRegistry(registry_);
    }

    function createPlan(
        address account,
        bytes32 intentId,
        CLTypes.AdapterAction[] calldata actions,
        uint64 validUntil
    ) external returns (bytes32 planId) {
        if (account == address(0)) revert ZeroAddress();
        if (IPlannerAccountOwner(account).owner() != msg.sender) revert Unauthorized();
        if (actions.length == 0 || actions.length > MAX_STEPS || validUntil <= block.timestamp) revert InvalidPlan();

        for (uint256 i; i < actions.length; ++i) {
            if (actions[i].adapter == address(0) || !registry.isAdapterActive(actions[i].adapter)) revert InvalidPlan();
            if (actions[i].action.length == 0) revert InvalidPlan();
        }

        uint64 nonce = nextNonce[account]++;
        bytes32 actionsHash = hashActions(actions);
        planId = keccak256(
            abi.encode(block.chainid, address(this), account, nonce, intentId, actionsHash, validUntil)
        );

        _plans[planId] = Plan({
            account: account,
            intentId: intentId,
            actionsHash: actionsHash,
            validUntil: validUntil,
            stepCount: uint16(actions.length),
            nonce: nonce,
            status: Status.ACTIVE
        });

        emit PlanCreated(planId, account, intentId, actionsHash, uint16(actions.length), validUntil);
    }

    function cancelPlan(bytes32 planId) external {
        Plan storage plan = _requirePlan(planId);
        _requireOwner(plan.account);
        if (plan.status != Status.ACTIVE) revert InvalidStatus();
        plan.status = Status.CANCELLED;
        emit PlanCancelled(planId);
    }

    /// @notice Mark the exact committed action sequence consumed after successful owner execution.
    function markExecuted(bytes32 planId, CLTypes.AdapterAction[] calldata actions) external {
        Plan storage plan = _requirePlan(planId);
        _requireOwner(plan.account);
        if (plan.status != Status.ACTIVE || block.timestamp > plan.validUntil) revert InvalidStatus();
        if (plan.actionsHash != hashActions(actions) || plan.stepCount != actions.length) revert InvalidPlan();
        plan.status = Status.EXECUTED;
        emit PlanExecuted(planId);
    }

    function validatePlan(bytes32 planId, CLTypes.AdapterAction[] calldata actions) external view returns (bool) {
        Plan memory plan = _plans[planId];
        if (plan.status != Status.ACTIVE || block.timestamp > plan.validUntil) return false;
        return plan.stepCount == actions.length && plan.actionsHash == hashActions(actions);
    }

    function getPlan(bytes32 planId) external view returns (Plan memory) {
        Plan memory plan = _plans[planId];
        if (plan.status == Status.NONE) revert UnknownPlan();
        return plan;
    }

    function hashActions(CLTypes.AdapterAction[] calldata actions) public pure returns (bytes32) {
        return keccak256(abi.encode(actions));
    }

    function _requirePlan(bytes32 planId) internal view returns (Plan storage plan) {
        plan = _plans[planId];
        if (plan.status == Status.NONE) revert UnknownPlan();
    }

    function _requireOwner(address account) internal view {
        if (IPlannerAccountOwner(account).owner() != msg.sender) revert Unauthorized();
    }
}
