// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title TestnetEquityToken
/// @notice Faucet-backed synthetic equity token for Monad testnet Hashed demos only.
contract TestnetEquityToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    address public owner;
    uint256 public totalSupply;
    uint256 public constant FAUCET_AMOUNT = 10e18;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address account => mapping(address spender => uint256 allowanceAmount)) public allowance;
    mapping(address account => bool) public faucetClaimed;

    error Unauthorized();
    error ZeroAddress();
    error AlreadyClaimed();
    error InsufficientBalance();
    error InsufficientAllowance();

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory name_, string memory symbol_, address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        name = name_;
        symbol = symbol_;
        owner = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function faucet() external {
        if (faucetClaimed[msg.sender]) revert AlreadyClaimed();
        faucetClaimed[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        balanceOf[from] = balance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
