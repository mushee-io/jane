// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title JaneComputeRegistry
/// @notice Bonded registry for open Jane compute providers on Monad.
/// @dev Only hashes of provider metadata/endpoints are stored; endpoint details remain offchain.
contract JaneComputeRegistry {
    error BondTooSmall();
    error AlreadyRegistered();
    error NotOperator();
    error NotInactive();
    error WithdrawalLocked();
    error TransferFailed();

    uint256 public constant MIN_BOND = 0.01 ether;
    uint256 public constant WITHDRAW_DELAY = 7 days;

    struct Provider {
        address operator;
        bytes32 metadataHash;
        bytes32 endpointHash;
        uint256 bond;
        uint256 registeredAt;
        uint256 withdrawAfter;
        bool active;
    }

    mapping(address => Provider) public providers;

    event ProviderRegistered(address indexed operator, bytes32 indexed metadataHash, bytes32 indexed endpointHash, uint256 bond);
    event ProviderMetadataUpdated(address indexed operator, bytes32 metadataHash, bytes32 endpointHash);
    event ProviderDeactivated(address indexed operator, uint256 withdrawAfter);
    event BondWithdrawn(address indexed operator, uint256 amount);

    function register(bytes32 metadataHash, bytes32 endpointHash) external payable {
        if (providers[msg.sender].operator != address(0)) revert AlreadyRegistered();
        if (msg.value < MIN_BOND) revert BondTooSmall();

        providers[msg.sender] = Provider({
            operator: msg.sender,
            metadataHash: metadataHash,
            endpointHash: endpointHash,
            bond: msg.value,
            registeredAt: block.timestamp,
            withdrawAfter: 0,
            active: true
        });

        emit ProviderRegistered(msg.sender, metadataHash, endpointHash, msg.value);
    }

    function updateMetadata(bytes32 metadataHash, bytes32 endpointHash) external {
        Provider storage provider = providers[msg.sender];
        if (provider.operator != msg.sender) revert NotOperator();
        provider.metadataHash = metadataHash;
        provider.endpointHash = endpointHash;
        emit ProviderMetadataUpdated(msg.sender, metadataHash, endpointHash);
    }

    function deactivate() external {
        Provider storage provider = providers[msg.sender];
        if (provider.operator != msg.sender) revert NotOperator();
        provider.active = false;
        provider.withdrawAfter = block.timestamp + WITHDRAW_DELAY;
        emit ProviderDeactivated(msg.sender, provider.withdrawAfter);
    }

    function withdrawBond() external {
        Provider storage provider = providers[msg.sender];
        if (provider.operator != msg.sender) revert NotOperator();
        if (provider.active) revert NotInactive();
        if (block.timestamp < provider.withdrawAfter) revert WithdrawalLocked();

        uint256 amount = provider.bond;
        delete providers[msg.sender];

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit BondWithdrawn(msg.sender, amount);
    }
}
