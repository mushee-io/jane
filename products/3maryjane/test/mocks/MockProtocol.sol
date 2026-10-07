// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IMockToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MockProtocol {
    mapping(address account => mapping(address token => uint256 amount)) public supplied;

    function supply(address token, uint256 amount) external {
        require(IMockToken(token).transferFrom(msg.sender, address(this), amount), "TRANSFER_FROM");
        supplied[msg.sender][token] += amount;
    }
}
