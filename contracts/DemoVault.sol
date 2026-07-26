// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * DemoVault v1 — foundation for Tradeguard on-chain investing.
 *
 * Supports: deposit, withdraw, claimRewards, compound, pause, ownership.
 * Deploy to BNB Smart Chain Testnet (chainId 97) first; mainnet only after review.
 *
 * Remix: compile with 0.8.20+, deploy, copy address into
 * frontend/src/blockchain/config/contract.ts (CONTRACT_ADDRESS).
 */
contract DemoVault {
    address public owner;
    bool public paused;
    string public constant VERSION = "1.0.0";

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _pendingRewards;
    mapping(address => bool) private _isUser;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalUsers;
    uint256 public totalRewardsPaid;

    /// Demo reward rate in basis points of deposit credited once (100 = 1%).
    uint256 public rewardBps = 100;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event Claim(address indexed user, uint256 amount);
    event Compound(address indexed user, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "ZERO");
        if (!_isUser[msg.sender]) {
            _isUser[msg.sender] = true;
            totalUsers += 1;
        }
        _balances[msg.sender] += msg.value;
        totalDeposited += msg.value;
        // Accrue a demo reward on each deposit
        uint256 reward = (msg.value * rewardBps) / 10_000;
        _pendingRewards[msg.sender] += reward;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external whenNotPaused {
        require(amount > 0, "ZERO");
        require(_balances[msg.sender] >= amount, "INSUFFICIENT");
        _balances[msg.sender] -= amount;
        totalWithdrawn += amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
        emit Withdraw(msg.sender, amount);
    }

    function claimRewards() external whenNotPaused {
        uint256 amount = _pendingRewards[msg.sender];
        require(amount > 0, "NO_REWARDS");
        require(address(this).balance >= amount, "VAULT_LOW");
        _pendingRewards[msg.sender] = 0;
        totalRewardsPaid += amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TRANSFER_FAILED");
        emit Claim(msg.sender, amount);
    }

    function compoundRewards() external whenNotPaused {
        uint256 amount = _pendingRewards[msg.sender];
        require(amount > 0, "NO_REWARDS");
        _pendingRewards[msg.sender] = 0;
        _balances[msg.sender] += amount;
        totalDeposited += amount;
        emit Compound(msg.sender, amount);
    }

    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function pendingRewards(address user) external view returns (uint256) {
        return _pendingRewards[user];
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setRewardBps(uint256 bps) external onlyOwner {
        require(bps <= 1_000, "TOO_HIGH"); // max 10%
        rewardBps = bps;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {
        // Accept plain BNB transfers as deposits via fallback path is disabled;
        // users must call deposit().
        revert("USE_DEPOSIT");
    }
}
