# How to host Trade Guard (TraderRank Pro)

This is a **monorepo**: Next.js frontend + NestJS API + PostgreSQL.

Live production today:

| Service | Role | Typical host |
|---------|------|----------------|
| `frontend/` | Next.js 15 website | Render web service (`traders-web`) |
| `backend/` | NestJS API + Prisma | Render web service (`traders-api`) |
| PostgreSQL | App database | Neon |

API prefix: `/api/v1` · Swagger (when enabled): `/api/docs`

This copy **does not include secrets**. Never copy `.env` from production into a zip or a public repo.

---

## What you need

- Node.js **20+**
- A **PostgreSQL** database (Neon is what production uses)
- Two always-on Node processes (or two Render web services)
- A domain (optional but recommended) pointed at the frontend
- Accounts for the features you enable: **Resend** (email), **NOWPayments** (USDT), **Flutterwave** (MoMo), S3-compatible storage (KYC uploads)

Prisma uses **`db push`** — there are **no migration files**. Schema lives in `backend/prisma/schema.prisma`.

---

## 1. Local run (check the copy first)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env`:

- `DATABASE_URL` — your Postgres connection string
- `JWT_SECRET` — a long random string
- `FRONTEND_URL` / `PUBLIC_APP_URL` — `http://localhost:3000` locally
- `API_PUBLIC_URL` — `http://localhost:4000` locally
- `RESEND_API_KEY` + `EMAIL_FROM` if you want email

Edit `frontend/.env.local`:

- `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`
- `API_URL=http://localhost:4000` (used by Next rewrites)

```bash
cd backend && npm install && npx prisma generate && npx prisma db push
cd ../frontend && npm install
```

Start API:

```bash
cd backend && npm run start:dev
```

Start web:

```bash
cd frontend && npm run dev
```

- Site: http://localhost:3000
- API: http://localhost:4000/api/v1

Optional seed (creates an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`):

```bash
cd backend && npm run prisma:seed
```

---

## 2. Production on Render (same as current deploy)

Create **two** web services from this repo (or from a GitHub repo that contains this copy).

### A. Database (Neon)

1. Create a Neon project (Postgres).
2. Copy the **pooled** connection string as `DATABASE_URL`.
3. After the API first deploys, run `npx prisma db push` from the API service shell (or rely on start command below).

### B. API service (`traders-api`)

| Setting | Value |
|---------|--------|
| Root directory | `backend` |
| Runtime | Node |
| Build | `npm install && npx prisma generate && npm run build` |
| Start | `npm run prisma:push && npm run start:prod` |
| Health check | `/api/v1/leaderboard` |
| Port | `4000` (set `PORT=4000`) |

**Required env vars**

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=<long random secret>
FRONTEND_URL=https://your-frontend-domain
PUBLIC_APP_URL=https://your-frontend-domain
API_PUBLIC_URL=https://your-api-host
```

**Email (recommended)**

```
RESEND_API_KEY=re_...
EMAIL_FROM=Tradeguard <info@your-verified-domain>
```

Verify the sending domain in Resend (SPF/DKIM). Unverified domains go to spam or fail.

**Payments (if you use them)**

- NOWPayments: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_PUBLIC_KEY`, `NOWPAYMENTS_IPN_SECRET`, payout login if you send USDT out
- Flutterwave MoMo: `FLW_CLIENT_ID`, `FLW_CLIENT_SECRET`, `FLW_ENCRYPTION_KEY`, `FLW_WEBHOOK_SECRET`

**Uploads / KYC**

```
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=us-east-1
```

Point IPN / webhook URLs at the **API** host, for example:

- NOWPayments IPN → `https://YOUR-API/api/v1/...` (see backend payment webhooks)
- Flutterwave webhook → API host, not the Next.js service

Do **not** put payment secrets on the frontend service.

### C. Frontend service (`traders-web`)

| Setting | Value |
|---------|--------|
| Root directory | `frontend` |
| Runtime | Node |
| Build | `npm install && npm run build` |
| Start | `npm start` |

**Required env vars** (must be set **before** `next build` for `NEXT_PUBLIC_*`)

```
NODE_ENV=production
API_URL=https://YOUR-API-HOST
NEXT_PUBLIC_API_URL=https://YOUR-API-HOST/api/v1
```

Optional (MoMo UI / blockchain explorer labels):

```
NEXT_PUBLIC_MOMO_ENABLED=true
NEXT_PUBLIC_MOMO_CURRENCY=UGX
NEXT_PUBLIC_MOMO_COUNTRY_CODE=256
NEXT_PUBLIC_MOMO_USD_RATE=3800
NEXT_PUBLIC_CHAIN_ID=80002
NEXT_PUBLIC_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
NEXT_PUBLIC_EXPLORER_URL=https://amoy.polygonscan.com
NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=hybrid
NEXT_PUBLIC_CONTRACT_ADDRESS=
```

Custom domain: attach it to **traders-web**, then set `FRONTEND_URL` and `PUBLIC_APP_URL` on the API to that domain and redeploy **both** services.

### D. CORS / cookies

The API allows origins from `FRONTEND_URL`. If you change the site URL, update API env and redeploy the API.

---

## 3. Blueprint file

`render.yaml` at the repo root already describes `traders-api` and `traders-web`. You can import it in Render, then fill in `sync: false` secrets in the dashboard.

Ignore extra Render services (for example an auto-connected **traders-1** at repo root). Only the two services above are needed.

---

## 4. After first deploy checklist

1. `npx prisma db push` on the API (or confirm start command ran it).
2. Open `https://YOUR-API-HOST/api/v1/leaderboard` — should return JSON, not HTML.
3. Open the website, register or log in.
4. Send a test email (register / deposit) and confirm it lands (check spam).
5. Set webhooks on NOWPayments / Flutterwave to the **API** URL.
6. Create at least one admin user (`role = ADMIN`) in the database if seed was not used.

---

## 5. Optional pieces (not required for core wallet / Smart Invest)

| Folder | What it is |
|--------|------------|
| `local-admin/` | Staff admin UI (separate Next app, often port 3099). Set `ADMIN_HUB_URL` on the API. |
| `mt5-guard/` | Expo / MT5 Guard mobile app |
| `mobile/` | Extra mobile client |
| `backend/scripts/` | One-off admin scripts (deposits, broadcasts). Run locally with `npx tsx` against `DATABASE_URL`. **Do not** expose these as public HTTP. |

---

## 6. Security

- Never commit `.env`, `.env.local`, or API keys.
- Rotate `JWT_SECRET` if this copy left a machine you do not control.
- Production `DATABASE_URL` should use SSL (`sslmode=require` on Neon).
- Keep KYC files on S3, not in git (`backend/uploads/` is ignored).

---

## 7. Updating production

Push to the Git branch Render watches (usually `main`), or trigger deploy hooks.

After schema changes in `backend/prisma/schema.prisma`, redeploy **traders-api** so `prisma db push` runs.

After frontend-only changes, redeploy **traders-web**. `NEXT_PUBLIC_*` changes require a **rebuild**, not only a restart.
