// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20StakeToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title 33G
/// @notice Fixed-supply optional utility token for the Jane ecosystem.
/// @dev No mint function exists after deployment. The full fixed supply is minted to the treasury.
contract Jane33G {
    string public constant name = "33G";
    string public constant symbol = "33G";
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(address treasury) {
        require(treasury != address(0), "treasury");
        balanceOf[treasury] = totalSupply;
        emit Transfer(address(0), treasury, totalSupply);
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
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to");
        uint256 balance = balanceOf[from];
        require(balance >= amount, "balance");
        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}

/// @title Jane33GUtility
/// @notice Optional staking utility. Benefits apply to Jane platform fees/limits, not upstream provider obligations.
contract Jane33GUtility {
    IERC20StakeToken public immutable token;
    uint256 public constant LOCK_PERIOD = 7 days;

    uint256 public constant TIER1 = 10_000 ether;
    uint256 public constant TIER2 = 100_000 ether;
    uint256 public constant TIER3 = 1_000_000 ether;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public lastStakeAt;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "token");
        token = IERC20StakeToken(tokenAddress);
    }

    function stake(uint256 amount) external {
        require(amount > 0, "amount");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer");
        stakedBalance[msg.sender] += amount;
        lastStakeAt[msg.sender] = block.timestamp;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        require(block.timestamp >= lastStakeAt[msg.sender] + LOCK_PERIOD, "locked");
        require(stakedBalance[msg.sender] >= amount, "stake");
        stakedBalance[msg.sender] -= amount;
        require(token.transfer(msg.sender, amount), "transfer");
        emit Unstaked(msg.sender, amount);
    }

    function tierOf(address account) public view returns (uint8) {
        uint256 amount = stakedBalance[account];
        if (amount >= TIER3) return 3;
        if (amount >= TIER2) return 2;
        if (amount >= TIER1) return 1;
        return 0;
    }

    function benefitBps(address account) external view returns (uint256) {
        uint8 tier = tierOf(account);
        if (tier == 3) return 1500;
        if (tier == 2) return 1000;
        if (tier == 1) return 500;
        return 0;
    }
}
