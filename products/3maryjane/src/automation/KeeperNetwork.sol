// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLTypes} from "../types/CLTypes.sol";
import {DefensiveExecutor} from "./DefensiveExecutor.sol";

interface IKeeperAccountOwner {
    function owner() external view returns (address);
}

/// @title KeeperNetwork
/// @notice Schedules bounded defensive jobs for CL accounts and dispatches them through DefensiveExecutor.
/// @dev Jobs are user-created. Keepers cannot withdraw funds, bypass adapter allowlists, or commit a
///      non-risk-reducing batch because CLAccount performs the final atomic risk-reduction check.
contract KeeperNetwork {
    struct Job {
        address account;
        uint64 cooldown;
        uint64 lastExecutedAt;
        uint16 maxActions;
        bool active;
    }

    address public owner;
    DefensiveExecutor public immutable executor;
    mapping(address keeper => bool allowed) public keeperAllowed;
    mapping(address account => uint64 nextNonce) public nextNonce;
    mapping(bytes32 jobId => Job job) private _jobs;

    error Unauthorized();
    error ZeroAddress();
    error InvalidJob();
    error UnknownJob();
    error JobInactive();
    error CooldownActive();
    error TooManyActions();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event KeeperPermissionChanged(address indexed keeper, bool allowed);
    event JobCreated(bytes32 indexed jobId, address indexed account, uint64 cooldown, uint16 maxActions);
    event JobStatusChanged(bytes32 indexed jobId, bool active);
    event JobExecuted(bytes32 indexed jobId, address indexed keeper, uint64 executedAt, uint256 actionCount);

    constructor(address initialOwner, address executor_) {
        if (initialOwner == address(0) || executor_ == address(0)) revert ZeroAddress();
        owner = initialOwner;
        executor = DefensiveExecutor(executor_);
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

    function createJob(address account, uint64 cooldown, uint16 maxActions) external returns (bytes32 jobId) {
        if (account == address(0)) revert ZeroAddress();
        if (IKeeperAccountOwner(account).owner() != msg.sender) revert Unauthorized();
        if (maxActions == 0 || maxActions > executor.MAX_ACTIONS()) revert InvalidJob();

        uint64 nonce = nextNonce[account]++;
        jobId = keccak256(abi.encode(block.chainid, address(this), account, nonce));
        _jobs[jobId] = Job({
            account: account,
            cooldown: cooldown,
            lastExecutedAt: 0,
            maxActions: maxActions,
            active: true
        });

        emit JobCreated(jobId, account, cooldown, maxActions);
    }

    function setJobActive(bytes32 jobId, bool active) external {
        Job storage job = _requireJob(jobId);
        if (IKeeperAccountOwner(job.account).owner() != msg.sender) revert Unauthorized();
        job.active = active;
        emit JobStatusChanged(jobId, active);
    }

    function executeJob(bytes32 jobId, CLTypes.AdapterAction[] calldata actions)
        external
        onlyKeeper
        returns (bytes[][] memory results)
    {
        Job storage job = _requireJob(jobId);
        if (!job.active) revert JobInactive();
        if (actions.length == 0 || actions.length > job.maxActions) revert TooManyActions();
        if (job.lastExecutedAt != 0 && block.timestamp < uint256(job.lastExecutedAt) + job.cooldown) {
            revert CooldownActive();
        }

        // Effects before interaction. Any downstream failure reverts this timestamp too.
        job.lastExecutedAt = uint64(block.timestamp);
        results = executor.executeDefense(job.account, actions);
        emit JobExecuted(jobId, msg.sender, job.lastExecutedAt, actions.length);
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        Job memory job = _jobs[jobId];
        if (job.account == address(0)) revert UnknownJob();
        return job;
    }

    function _requireJob(bytes32 jobId) internal view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.account == address(0)) revert UnknownJob();
    }
}
