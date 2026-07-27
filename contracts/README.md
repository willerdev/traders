# Investment Vault — Polygon Amoy (chainId 80002)

Current live ABI matches the Remix contract with:

- `deposit` / `withdraw` (full) / `claimReward`
- `fundVault` (owner funds reward pool)
- `getUserInfo` / `calculateReward` / `dailyRate`
- `userCount` / `userList`

Synced to `frontend/src/blockchain/abi/DemoVaultV2.json` and backend ABI.

## Wire apps (Render)

**traders-web** (rebuild after change):
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourVault
NEXT_PUBLIC_CHAIN_ID=80002
```

**traders-api**:
```
DEMO_VAULT_ADDRESS=0xYourVault
```

Same address on both. Use the Deploy receipt address, then call `fundVault` so claims can pay.
