# TraderRank Local Admin

**Runs on your machine only** — not deployed to Render or thetradeguard.com.

## Setup

```bash
cd local-admin
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3099 and sign in with your **ADMIN** account  
(default seed: `admin@traderrank.pro` / `Admin123!ChangeMe`).

## Configure API

In `.env`:

```env
# Production API
VITE_API_URL=https://traders-c53s.onrender.com/api/v1

# Or local backend
# VITE_API_URL=http://localhost:4000/api/v1
```

## Tabs

1. **Overview** — revenue, users, pending KYC/payouts
2. **Users** — all registered traders
3. **Setups** — submitted signals
4. **KYC** — approve / reject identity
5. **Payouts** — review and approve payout requests
