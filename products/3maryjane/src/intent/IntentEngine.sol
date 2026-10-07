// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IIntentAccountOwner {
    function owner() external view returns (address);
}

/// @title IntentEngine
/// @notice Canonical owner-authenticated intent registry for CL automation and planners.
/// @dev Intents express desired economic outcomes and constraints. They do not grant custody or
///      arbitrary execution rights to solvers, agents, planners, or keepers.
contract IntentEngine {
    enum IntentKind {
        HEDGE,
        REBALANCE,
        DELEVERAGE,
        REPAY,
        SUPPLY,
        UNWIND,
        CUSTOM
    }

    enum Status {
        NONE,
        ACTIVE,
        CANCELLED,
        EXECUTED
    }

    struct Intent {
        address account;
        IntentKind kind;
        address asset;
        int256 targetNetUsd;
        uint256 maxNotionalUsd;
        uint64 deadline;
        uint64 nonce;
        bytes32 constraintsHash;
        bytes32 metadataHash;
        Status status;
        bytes32 boundPlanId;
    }

    mapping(address account => uint64 nextNonce) public nextNonce;
    mapping(bytes32 intentId => Intent intent) private _intents;

    error Unauthorized();
    error ZeroAddress();
    error InvalidDeadline();
    error InvalidNotional();
    error InvalidStatus();
    error UnknownIntent();

    event IntentCreated(
        bytes32 indexed intentId,
        address indexed account,
        uint64 indexed nonce,
        IntentKind kind,
        address asset,
        int256 targetNetUsd,
        uint256 maxNotionalUsd,
        uint64 deadline
    );
    event IntentCancelled(bytes32 indexed intentId);
    event IntentPlanBound(bytes32 indexed intentId, bytes32 indexed planId);
    event IntentExecuted(bytes32 indexed intentId, bytes32 indexed planId);

    function createIntent(
        address account,
        IntentKind kind,
        address asset,
        int256 targetNetUsd,
        uint256 maxNotionalUsd,
        uint64 deadline,
        bytes32 constraintsHash,
        bytes32 metadataHash
    ) external returns (bytes32 intentId) {
        if (account == address(0)) revert ZeroAddress();
        if (IIntentAccountOwner(account).owner() != msg.sender) revert Unauthorized();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (maxNotionalUsd == 0) revert InvalidNotional();

        uint64 nonce = nextNonce[account]++;
        intentId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                account,
                nonce,
                kind,
                asset,
                targetNetUsd,
                maxNotionalUsd,
                deadline,
                constraintsHash,
                metadataHash
            )
        );

        _intents[intentId] = Intent({
            account: account,
            kind: kind,
            asset: asset,
            targetNetUsd: targetNetUsd,
            maxNotionalUsd: maxNotionalUsd,
            deadline: deadline,
            nonce: nonce,
            constraintsHash: constraintsHash,
            metadataHash: metadataHash,
            status: Status.ACTIVE,
            boundPlanId: bytes32(0)
        });

        emit IntentCreated(intentId, account, nonce, kind, asset, targetNetUsd, maxNotionalUsd, deadline);
    }

    function cancelIntent(bytes32 intentId) external {
        Intent storage intent = _requireIntent(intentId);
        _requireOwner(intent.account);
        if (intent.status != Status.ACTIVE) revert InvalidStatus();
        intent.status = Status.CANCELLED;
        emit IntentCancelled(intentId);
    }

    /// @notice Bind an intent to an immutable plan commitment.
    /// @dev Binding remains an owner action; planners cannot silently replace user intent.
    function bindPlan(bytes32 intentId, bytes32 planId) external {
        Intent storage intent = _requireIntent(intentId);
        _requireOwner(intent.account);
        if (intent.status != Status.ACTIVE || block.timestamp > intent.deadline) revert InvalidStatus();
        if (planId == bytes32(0)) revert InvalidStatus();
        intent.boundPlanId = planId;
        emit IntentPlanBound(intentId, planId);
    }

    function markExecuted(bytes32 intentId, bytes32 planId) external {
        Intent storage intent = _requireIntent(intentId);
        _requireOwner(intent.account);
        if (intent.status != Status.ACTIVE || block.timestamp > intent.deadline) revert InvalidStatus();
        if (intent.boundPlanId != bytes32(0) && intent.boundPlanId != planId) revert InvalidStatus();
        intent.boundPlanId = planId;
        intent.status = Status.EXECUTED;
        emit IntentExecuted(intentId, planId);
    }

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        Intent memory intent = _intents[intentId];
        if (intent.status == Status.NONE) revert UnknownIntent();
        return intent;
    }

    function isActive(bytes32 intentId) external view returns (bool) {
        Intent memory intent = _intents[intentId];
        return intent.status == Status.ACTIVE && block.timestamp <= intent.deadline;
    }

    function _requireIntent(bytes32 intentId) internal view returns (Intent storage intent) {
        intent = _intents[intentId];
        if (intent.status == Status.NONE) revert UnknownIntent();
    }

    function _requireOwner(address account) internal view {
        if (IIntentAccountOwner(account).owner() != msg.sender) revert Unauthorized();
    }
}
