// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {CLAccount} from "./CLAccount.sol";

contract CLAccountFactory {
    address public immutable registry;

    event AccountCreated(address indexed owner, address indexed account, bytes32 indexed salt);

    constructor(address registry_) {
        require(registry_ != address(0), "ZERO_REGISTRY");
        registry = registry_;
    }

    function createAccount(bytes32 salt) external returns (address account) {
        bytes32 finalSalt = keccak256(abi.encode(msg.sender, salt));
        account = address(new CLAccount{salt: finalSalt}(msg.sender, registry));
        emit AccountCreated(msg.sender, account, salt);
    }

    function predictAccount(address accountOwner, bytes32 salt) external view returns (address predicted) {
        bytes32 finalSalt = keccak256(abi.encode(accountOwner, salt));
        bytes memory initCode = abi.encodePacked(type(CLAccount).creationCode, abi.encode(accountOwner, registry));
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), finalSalt, keccak256(initCode)));
        predicted = address(uint160(uint256(hash)));
    }
}
