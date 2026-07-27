# Vault v3 — Polygon Amoy (chainId 80002)

Architecture:

```
Vault Contract
├── Enroll & Deposits
├── User balances
├── Reward calculation engine
├── Daily settlement
├── Withdrawal queue
└── Treasury
        └── Pays rewards
```

Source: `contracts/Vault.sol`  
ABI: `contracts/Vault.abi.json` (synced to frontend/backend `DemoVaultV2.json` for the live dashboard)

## Defaults
| Param | Default | Notes |
|---|---|---|
| `minDeposit` | 0.01 POL | Raise toward ~2000e18 for mainnet $2k policy |
| `dailyRewardBps` | 1500 | 15%/day (product copy) — tune before mainnet |

## Remix deploy
1. Open https://remix.ethereum.org
2. Paste `Vault.sol`
3. Compile Solidity **0.8.20+**
4. Deploy with Injected Provider → MetaMask on **Polygon Amoy**
5. Copy the address from the **Deploy transaction receipt** (not Remix “At Address”)
6. Owner: `fundTreasury{value: …}()` so claims can pay

## Wire apps (Render)
**traders-web** (rebuild after change):
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourVault
NEXT_PUBLIC_CHAIN_ID=80002
NEXT_PUBLIC_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
NEXT_PUBLIC_EXPLORER_URL=https://amoy.polygonscan.com
```

**traders-api**:
```
DEMO_VAULT_ADDRESS=0xYourVault
POLYGON_AMOY_RPC=https://polygon-amoy-bor-rpc.publicnode.com
```

## User flow
1. `enroll()` (or first `deposit()` auto-enrolls)
2. `deposit()` ≥ minDeposit → principal pool
3. Rewards accrue daily (`dailyRewardBps`); `settleUser` / `settleDaily` locks them
4. `claimReward()` pays from **treasury**
5. `requestWithdraw` / `withdraw` queues principal; owner `processWithdraw` pays

## Verify
- `/blockchain` dashboard loads live stats
- Deposit small Amoy POL
- Fund treasury before claiming
