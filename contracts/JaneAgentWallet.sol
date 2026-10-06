// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IJaneInferenceSettlement {
    function settleInference(
        bytes32 receiptHash,
        bytes32 requestHash,
        bytes32 policyHash,
        address provider,
        address token,
        uint256 amount
    ) external payable;
}

interface IERC20AgentWallet {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title JaneAgentWallet
/// @notice Budget-constrained wallet for autonomous 33jane agents.
/// @dev The wallet can pay inference through JaneInferenceSettlement without exposing prompts onchain.
contract JaneAgentWallet {
    error NotOwner();
    error NotAuthorizedAgent();
    error InvalidAddress();
    error BudgetExceeded();
    error TransferFailed();
    error Reentrancy();

    address public owner;
    address public agent;
    address public immutable settlement;
    uint256 public dailyLimit;
    uint256 public perRequestLimit;

    uint256 public spentToday;
    uint256 public spendDay;

    bool private entered;

    event AgentUpdated(address indexed agent);
    event BudgetsUpdated(uint256 dailyLimit, uint256 perRequestLimit);
    event AgentInferencePaid(bytes32 indexed receiptHash, address indexed agent, address indexed provider, address token, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != owner && msg.sender != agent) revert NotAuthorizedAgent();
        _;
    }

    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address initialOwner,
        address settlementContract,
        uint256 initialDailyLimit,
        uint256 initialPerRequestLimit
    ) {
        if (initialOwner == address(0) || settlementContract == address(0)) revert InvalidAddress();
        owner = initialOwner;
        settlement = settlementContract;
        dailyLimit = initialDailyLimit;
        perRequestLimit = initialPerRequestLimit;
    }

    receive() external payable {}

    function setAgent(address newAgent) external onlyOwner {
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function setBudgets(uint256 newDailyLimit, uint256 newPerRequestLimit) external onlyOwner {
        dailyLimit = newDailyLimit;
        perRequestLimit = newPerRequestLimit;
        emit BudgetsUpdated(newDailyLimit, newPerRequestLimit);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        owner = newOwner;
    }

    function depositToken(address token, uint256 amount) external nonReentrant {
        if (token == address(0)) revert InvalidAddress();
        bool ok = IERC20AgentWallet(token).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
    }

    function payInference(
        bytes32 receiptHash,
        bytes32 requestHash,
        bytes32 policyHash,
        address provider,
        address token,
        uint256 amount
    ) external onlyAuthorized nonReentrant {
        _rollDay();
        if (amount == 0 || amount > perRequestLimit || spentToday + amount > dailyLimit) revert BudgetExceeded();
        spentToday += amount;

        if (token == address(0)) {
            if (address(this).balance < amount) revert TransferFailed();
            IJaneInferenceSettlement(settlement).settleInference{value: amount}(
                receiptHash,
                requestHash,
                policyHash,
                provider,
                token,
                amount
            );
        } else {
            bool resetOk = IERC20AgentWallet(token).approve(settlement, 0);
            bool approveOk = IERC20AgentWallet(token).approve(settlement, amount);
            if (!resetOk || !approveOk) revert TransferFailed();
            IJaneInferenceSettlement(settlement).settleInference(
                receiptHash,
                requestHash,
                policyHash,
                provider,
                token,
                amount
            );
        }

        emit AgentInferencePaid(receiptHash, msg.sender, provider, token, amount);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        (bool sent, ) = to.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Withdrawn(address(0), to, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert InvalidAddress();
        bool ok = IERC20AgentWallet(token).transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit Withdrawn(token, to, amount);
    }

    function remainingToday() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (today != spendDay) return dailyLimit;
        if (spentToday >= dailyLimit) return 0;
        return dailyLimit - spentToday;
    }

    function _rollDay() internal {
        uint256 today = block.timestamp / 1 days;
        if (today != spendDay) {
            spendDay = today;
            spentToday = 0;
        }
    }
}
