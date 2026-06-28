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

1. **Overview** — revenue, users, pending KYC/payouts
2. **Users** — all registered traders
3. **Setups** — submitted signals
4. **KYC** — approve / reject identity
5. **Payouts** — review and approve payout requests
