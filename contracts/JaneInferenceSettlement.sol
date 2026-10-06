// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title JaneInferenceSettlement
/// @notice Minimal settlement and receipt-anchor contract for 33jane inference.
/// @dev Prompts and responses never touch this contract. Only hashes and payment metadata do.
contract JaneInferenceSettlement {
    error InvalidProvider();
    error InvalidAmount();
    error InvalidNativeValue();
    error TransferFailed();
    error ReceiptAlreadySettled();

    mapping(bytes32 => bool) public settledReceipts;

    event InferenceSettled(
        address indexed payer,
        address indexed provider,
        bytes32 indexed receiptHash,
        bytes32 requestHash,
        bytes32 policyHash,
        address token,
        uint256 amount
    );

    function settleInference(
        bytes32 receiptHash,
        bytes32 requestHash,
        bytes32 policyHash,
        address provider,
        address token,
        uint256 amount
    ) external payable {
        if (provider == address(0)) revert InvalidProvider();
        if (amount == 0) revert InvalidAmount();
        if (settledReceipts[receiptHash]) revert ReceiptAlreadySettled();

        settledReceipts[receiptHash] = true;

        if (token == address(0)) {
            if (msg.value != amount) revert InvalidNativeValue();
            (bool sent, ) = payable(provider).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            if (msg.value != 0) revert InvalidNativeValue();
            bool ok = IERC20Minimal(token).transferFrom(msg.sender, provider, amount);
            if (!ok) revert TransferFailed();
        }

        emit InferenceSettled(
            msg.sender,
            provider,
            receiptHash,
            requestHash,
            policyHash,
            token,
            amount
        );
    }
}
