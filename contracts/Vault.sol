// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Vault — Tradeguard on-chain investment (Polygon Amoy → mainnet later)
 *
 * Structure:
 *   Vault
 *   ├── Enroll & Deposits
 *   ├── User balances
 *   ├── Reward calculation engine
 *   ├── Daily settlement
 *   ├── Withdrawal queue
 *   └── Treasury ──► pays rewards
 *
 * Defaults (owner-configurable):
 *   - minDeposit: 0.01 native (raise to ~2000e18 for mainnet $2k policy)
 *   - dailyRewardBps: 1500 (15% / day — product copy; tune before mainnet)
 *
 * Remix: Solidity 0.8.20+, Injected Provider → Polygon Amoy (80002).
 * Copy the Deploy receipt address into Render NEXT_PUBLIC_CONTRACT_ADDRESS.
 */
contract Vault {
    // -------------------------------------------------------------------------
    // Access / pause (minimal Ownable + Pausable + reentrancy)
    // -------------------------------------------------------------------------
    address public owner;
    bool public paused;
    uint256 private _status; // 1 = entered
    string public constant VERSION = "3.0.0";

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier nonReentrant() {
        require(_status != 1, "REENTRANT");
        _status = 1;
        _;
        _status = 0;
    }

    // -------------------------------------------------------------------------
    // Config
    // -------------------------------------------------------------------------
    /// @notice Minimum deposit (wei). Testnet default 0.01 ether; set higher for mainnet.
    uint256 public minDeposit = 0.01 ether;
    /// @notice Daily reward in basis points of principal (1500 = 15%/day).
    uint256 public dailyRewardBps = 1500;
    /// @notice Max bps owner may set (2000 = 20%/day).
    uint256 public constant MAX_DAILY_REWARD_BPS = 2000;

    // -------------------------------------------------------------------------
    // User balances
    // -------------------------------------------------------------------------
    mapping(address => uint256) public balances;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public pendingWithdraw;
    mapping(address => bool) public enrolled;
    mapping(address => uint256) public lastSettledDay; // unix day index
    mapping(address => uint256) public enrolledDay;

    address[] public users;
    uint256 public userCount;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public totalRewardsPaid;

    // -------------------------------------------------------------------------
    // Treasury (pays rewards)
    // -------------------------------------------------------------------------
    /// @notice Wei reserved for reward payouts (funded by owner / receive).
    uint256 public treasuryPool;
    /// @notice Wei backing user principal (deposits − processed withdrawals).
    uint256 public principalPool;

    // -------------------------------------------------------------------------
    // Withdrawal queue
    // -------------------------------------------------------------------------
    struct WithdrawRequest {
        address user;
        uint256 amount;
        uint64 requestedAt;
        bool processed;
        bool cancelled;
    }

    WithdrawRequest[] public withdrawQueue;
    uint256 public withdrawQueueLength;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event Enrolled(address indexed user, uint256 timestamp);
    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event RewardSettled(address indexed user, uint256 amount, uint256 daysAccrued, uint256 timestamp);
    event DailySettlement(uint256 usersProcessed, uint256 timestamp);
    event WithdrawRequested(address indexed user, uint256 indexed requestId, uint256 amount, uint256 timestamp);
    event WithdrawCancelled(address indexed user, uint256 indexed requestId, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event RewardClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event RewardAdded(address indexed user, uint256 amount, uint256 timestamp);
    event ContractFunded(uint256 amount, uint256 timestamp);
    event TreasuryFunded(uint256 amount, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);
    event MinDepositUpdated(uint256 minDeposit);
    event DailyRewardBpsUpdated(uint256 bps);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =========================================================================
    // Enroll & Deposits
    // =========================================================================

    function enroll() public whenNotPaused {
        require(!enrolled[msg.sender], "ALREADY_ENROLLED");
        _enroll(msg.sender);
    }

    function deposit() external payable whenNotPaused nonReentrant {
        require(msg.value >= minDeposit, "BELOW_MIN");
        if (!enrolled[msg.sender]) {
            _enroll(msg.sender);
        }
        _settleUser(msg.sender);

        balances[msg.sender] += msg.value;
        principalPool += msg.value;
        totalDeposited += msg.value;

        emit Deposited(msg.sender, msg.value, block.timestamp);
    }

    function _enroll(address user) internal {
        enrolled[user] = true;
        users.push(user);
        userCount += 1;
        uint256 day = _currentDay();
        enrolledDay[user] = day;
        lastSettledDay[user] = day;
        emit Enrolled(user, block.timestamp);
    }

    // =========================================================================
    // User balances (views)
    // =========================================================================

    function getUserBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getReward(address user) public view returns (uint256) {
        return rewards[user] + _previewAccrued(user);
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function isEnrolled(address user) external view returns (bool) {
        return enrolled[user];
    }

    // =========================================================================
    // Reward calculation engine
    // =========================================================================

    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @notice Accrued but not yet settled rewards for `user`.
    function previewAccrued(address user) external view returns (uint256) {
        return _previewAccrued(user);
    }

    function _previewAccrued(address user) internal view returns (uint256) {
        if (!enrolled[user] || balances[user] == 0) return 0;
        uint256 today = _currentDay();
        uint256 last = lastSettledDay[user];
        if (today <= last) return 0;
        uint256 daysElapsed = today - last;
        return (balances[user] * dailyRewardBps * daysElapsed) / 10_000;
    }

    function calculateReward(uint256 principal, uint256 daysElapsed) public view returns (uint256) {
        return (principal * dailyRewardBps * daysElapsed) / 10_000;
    }

    // =========================================================================
    // Daily settlement
    // =========================================================================

    /// @notice Lock accrued rewards into `rewards[user]` up to today.
    function settleUser(address user) public whenNotPaused {
        _settleUser(user);
    }

    function settleSelf() external whenNotPaused {
        _settleUser(msg.sender);
    }

    /// @notice Batch settle a slice of the user list (keeper / owner).
    function settleDaily(uint256 startIdx, uint256 count) external whenNotPaused onlyOwner {
        require(count > 0, "ZERO_COUNT");
        uint256 end = startIdx + count;
        if (end > users.length) end = users.length;
        uint256 processed;
        for (uint256 i = startIdx; i < end; i++) {
            _settleUser(users[i]);
            processed++;
        }
        emit DailySettlement(processed, block.timestamp);
    }

    function _settleUser(address user) internal {
        if (!enrolled[user]) return;
        uint256 today = _currentDay();
        uint256 last = lastSettledDay[user];
        if (today <= last) return;

        uint256 daysElapsed = today - last;
        uint256 accrued;
        if (balances[user] > 0 && dailyRewardBps > 0) {
            accrued = (balances[user] * dailyRewardBps * daysElapsed) / 10_000;
        }

        lastSettledDay[user] = today;
        if (accrued == 0) return;

        rewards[user] += accrued;
        emit RewardSettled(user, accrued, daysElapsed, block.timestamp);
    }

    // =========================================================================
    // Withdrawal queue
    // =========================================================================

    /// @notice Queue a principal withdrawal (processed by treasury/owner).
    function requestWithdraw(uint256 amount) public whenNotPaused nonReentrant {
        require(amount > 0, "ZERO");
        require(enrolled[msg.sender], "NOT_ENROLLED");
        _settleUser(msg.sender);
        require(balances[msg.sender] >= amount, "INSUFFICIENT");

        balances[msg.sender] -= amount;
        pendingWithdraw[msg.sender] += amount;

        uint256 id = withdrawQueue.length;
        withdrawQueue.push(
            WithdrawRequest({
                user: msg.sender,
                amount: amount,
                requestedAt: uint64(block.timestamp),
                processed: false,
                cancelled: false
            })
        );
        withdrawQueueLength = withdrawQueue.length;

        emit WithdrawRequested(msg.sender, id, amount, block.timestamp);
    }

    /// @notice Alias for dashboard / V2 ABI compatibility.
    function withdraw(uint256 amount) external {
        requestWithdraw(amount);
    }

    function cancelWithdraw(uint256 requestId) external whenNotPaused nonReentrant {
        require(requestId < withdrawQueue.length, "BAD_ID");
        WithdrawRequest storage req = withdrawQueue[requestId];
        require(req.user == msg.sender, "NOT_YOURS");
        require(!req.processed && !req.cancelled, "DONE");

        req.cancelled = true;
        pendingWithdraw[msg.sender] -= req.amount;
        balances[msg.sender] += req.amount;

        emit WithdrawCancelled(msg.sender, requestId, req.amount);
    }

    /// @notice Owner/treasury pays a queued withdrawal from the principal pool.
    function processWithdraw(uint256 requestId) external onlyOwner nonReentrant {
        require(requestId < withdrawQueue.length, "BAD_ID");
        WithdrawRequest storage req = withdrawQueue[requestId];
        require(!req.processed && !req.cancelled, "DONE");
        require(principalPool >= req.amount, "PRINCIPAL_LOW");
        require(address(this).balance >= req.amount, "VAULT_LOW");

        req.processed = true;
        pendingWithdraw[req.user] -= req.amount;
        principalPool -= req.amount;
        totalWithdrawn += req.amount;

        (bool ok, ) = payable(req.user).call{value: req.amount}("");
        require(ok, "TRANSFER_FAILED");

        emit Withdrawn(req.user, req.amount, block.timestamp);
    }

    function getWithdrawRequest(uint256 requestId)
        external
        view
        returns (address user, uint256 amount, uint64 requestedAt, bool processed, bool cancelled)
    {
        WithdrawRequest storage req = withdrawQueue[requestId];
        return (req.user, req.amount, req.requestedAt, req.processed, req.cancelled);
    }

    // =========================================================================
    // Treasury — pays rewards
    // =========================================================================

    function fundTreasury() external payable onlyOwner {
        require(msg.value > 0, "ZERO");
        treasuryPool += msg.value;
        emit TreasuryFunded(msg.value, block.timestamp);
        emit ContractFunded(msg.value, block.timestamp);
    }

    /// @notice Claim settled (+ auto-settle) rewards; paid from treasuryPool.
    function claimReward() external whenNotPaused nonReentrant {
        require(enrolled[msg.sender], "NOT_ENROLLED");
        _settleUser(msg.sender);

        uint256 amount = rewards[msg.sender];
        require(amount > 0, "NO_REWARDS");
        require(treasuryPool >= amount, "TREASURY_LOW");
        require(address(this).balance >= amount, "VAULT_LOW");

        rewards[msg.sender] = 0;
        treasuryPool -= amount;
        totalRewardsPaid += amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "TRANSFER_FAILED");

        emit RewardClaimed(msg.sender, amount, block.timestamp);
    }

    /// @notice Owner credits rewards to a user (manual / promo) — backed by treasury.
    function addReward(address user, uint256 amount) external onlyOwner {
        require(enrolled[user], "NOT_ENROLLED");
        require(amount > 0, "ZERO");
        rewards[user] += amount;
        emit RewardAdded(user, amount, block.timestamp);
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setMinDeposit(uint256 amount) external onlyOwner {
        minDeposit = amount;
        emit MinDepositUpdated(amount);
    }

    function setDailyRewardBps(uint256 bps) external onlyOwner {
        require(bps <= MAX_DAILY_REWARD_BPS, "TOO_HIGH");
        dailyRewardBps = bps;
        emit DailyRewardBpsUpdated(bps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }

    /// @notice Emergency: owner drains entire balance (testnet / pause incident).
    function emergencyWithdraw() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        principalPool = 0;
        treasuryPool = 0;
        (bool ok, ) = payable(owner).call{value: bal}("");
        require(ok, "TRANSFER_FAILED");
    }

    /// @notice Plain transfers fund the treasury (rewards), not principal.
    receive() external payable {
        treasuryPool += msg.value;
        emit TreasuryFunded(msg.value, block.timestamp);
        emit ContractFunded(msg.value, block.timestamp);
    }
}
