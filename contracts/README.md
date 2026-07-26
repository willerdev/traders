# DemoVault v1 — deploy on BNB Smart Chain Testnet (chainId 97)

## 1. Remix
1. Open https://remix.ethereum.org
2. Paste `DemoVault.sol`
3. Compile with Solidity 0.8.20+
4. Deploy with Injected Provider → MetaMask on **BNB Testnet**
5. Copy the deployed address

## 2. Wire the apps
Frontend `frontend/.env.local`:
```
NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=hybrid
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYourAddress
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
NEXT_PUBLIC_EXPLORER_URL=https://testnet.bscscan.com
```

Backend `backend/.env`:
```
DEMO_VAULT_ADDRESS=0xYourAddress
BNB_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545/
BNB_CHAIN_ID=97
```

## 3. Verify
- Connect MetaMask on `/blockchain`
- Deposit a small amount of tBNB
- Confirm lifecycle UI: Preparing → Wallet Confirmation → … → Completed
- Admin → Sync Blockchain to index events into Postgres

## 4. Later
- Verify contract on https://testnet.bscscan.com
- Security review before mainnet
