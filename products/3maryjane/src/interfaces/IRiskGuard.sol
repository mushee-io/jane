// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IRiskGuard {
    /// @notice Whether an adapter is included in the account's enforced risk universe.
    function isAdapterCovered(address account, address adapter) external view returns (bool);

    /// @notice Capture pre-action risk state. Returned bytes are opaque to CLAccount.
    function capture(address account) external view returns (bytes memory state);

    /// @notice Validate the post-action state against policy or a permitted risk-reducing transition.
    function validateTransition(address account, bytes calldata beforeState)
        external
        view
        returns (bool ok, bytes32 reason);

    /// @notice Require a transition to be strictly defensive even if the account remains policy-breached.
    /// @dev Used by delegated automation paths. Implementations should compare complete pre/post risk state.
    function validateRiskReduction(address account, bytes calldata beforeState)
        external
        view
        returns (bool ok, bytes32 reason);
}
