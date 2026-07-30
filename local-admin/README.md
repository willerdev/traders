# TraderRank Local Admin (Investment)

**Runs on your machine only** — not deployed to Render or thetradeguard.com.

Investment-focused console: investor/depositor platform, users, payouts, transactions, and KYC.

## Setup

```bash
cd local-admin
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:3099 and sign in with your **ADMIN** account  
(default seed: `admin@traderrank.pro` / `Admin123!ChangeMe`).

Requests go through the Vite dev proxy (`/api/v1` → production API) so the browser is not blocked by CORS.

## Configure API

In `.env`:

```env
VITE_API_URL=/api/v1
VITE_PROXY_TARGET=https://traders-c53s.onrender.com

# Or local backend (run `npm run start:dev` in backend/ first):
# VITE_PROXY_TARGET=http://localhost:4000
```

## Tabs

1. **Investor & depositor** — yields, enrollments, income journal, wallet tools
2. **Users** — registered accounts
3. **Payouts** — approve wallet withdrawals / custody
4. **Transactions** — NOWPayments / MoMo payments
5. **KYC** — approve / reject identity (required for payouts)
