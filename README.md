# TraderRank Pro

A trader talent-discovery and funding platform where traders compete by submitting trading setups before execution, earning rankings, payouts, and account scaling based on performance.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Next.js 15 │────▶│  NestJS API │────▶│  PostgreSQL  │
│  Frontend   │     │  + Prisma   │     │  Database    │
└─────────────┘     └─────────────┘     └──────────────┘
       │                    │
       └──────── Nginx ─────┘
```

**Business model:** Registration fees fund operations. Trader payouts come from subscription revenue, premium memberships, signal marketplace fees, copy-trading commissions, and sponsorships.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, TypeScript, Tailwind CSS, Framer Motion, Zustand |
| Backend | NestJS, TypeScript, Prisma ORM |
| Database | PostgreSQL (Neon) + optional Data API |
| Auth | JWT, Google OAuth, Email, Wallet (MetaMask) |
| Payments | USDT (TRC20/BEP20) via NOWPayments |
| Storage | AWS S3 Compatible |
| Deploy | Docker, Nginx, VPS-ready |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### 1. Start the database

```bash
npm run db:up
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

### 3. Install dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 4. Run migrations & seed

```bash
npm run db:migrate
npm run db:seed
```

### 5. Start development servers

```bash
npm run dev
```

- **Frontend:** http://localhost:3000
- **API:** http://localhost:4000/api/v1
- **Swagger:** http://localhost:4000/api/docs

### Neon Data API (optional)

For HTTP/REST access to Postgres (PostgREST-compatible), set in `backend/.env`:

```bash
NEON_DATA_API_URL="https://ep-wispy-haze-aic3iki0.apirest.c-4.us-east-1.aws.neon.tech/neondb/rest/v1"
NEON_DATA_API_JWT="your-jwt-bearer-token"
```

The Data API requires a JWT bearer token (Neon Auth or an external provider like Clerk/Auth0). The NestJS API continues to use Prisma via `DATABASE_URL` as the primary path; the optional `NeonDataClient` in `backend/src/prisma/neon-data.client.ts` is available for fast read queries once JWT is configured.

### Docker (full stack)

```bash
npm run docker:up
```

## Core Features

### Virtual Funded Accounts
- Starting balance: **$1,000**
- Fixed risk: **2%** ($20 max per trade)
- Automatic scaling: Bronze ($1K) → Elite ($25K)

### Signal Submission
- Immutable records with unique Signal ID
- Duplicate detection (90% similarity threshold)
- Screenshot hash anti-reuse

### Scoring Engine
| Event | Points |
|-------|--------|
| Win | +10 |
| Loss | -5 |
| RR 1:2 bonus | +5 |
| RR 1:3 bonus | +10 |
| RR 1:4 bonus | +15 |

### Losing Streak System
- 3 losses → Warning
- 5 losses → Score reduction (10%)
- 10 losses → Account reset

### Weekly Payouts
- Trader: **40%** of virtual profit
- Platform: **60%**
- Funded by revenue streams (not registration fees)

## API Endpoints

All routes are prefixed with `/api/v1`. Interactive docs: `GET /api/docs` (Swagger).

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register with email |
| POST | `/auth/login` | Email login |
| POST | `/auth/wallet` | MetaMask wallet login |
| GET | `/auth/verify-email` | Verify email token |

### Users & KYC
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/dashboard` | Trader dashboard data |
| GET | `/users/profile` | Profile details |
| PATCH | `/users/profile` | Update profile |
| GET | `/users/settings` | Settings bundle |
| PATCH | `/users/address` | Update address |
| GET | `/users/kyc` | KYC status |
| POST | `/users/kyc/submit` | Submit KYC documents |

### Signals & drafts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/signals` | Submit trading signal (forwards chart to Signal Hub) |
| GET | `/signals` | List my signals |
| POST | `/signals/{signalId}/claim` | Claim TP/SL for an unresolved open setup |
| POST | `/signals/{signalId}/archive` | Archive an open setup (no score/wallet change) |
| GET | `/signals/{signalId}/resolution` | Check whether a setup can be claimed |
| GET | `/signals/open/unresolved` | Open setups with claim eligibility |
| POST | `/signals/webhook/outcome` | **Webhook** — notify TP/SL hit (see below) |
| GET | `/signals/{signalId}` | Signal detail |
| GET/POST | `/signals/drafts` | List or create drafts |
| GET/PUT/DELETE | `/signals/drafts/{draftId}` | Draft CRUD |

### Signal Hub (MT5 execution proxy)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/signals/hub/health` | Hub configuration status |
| GET | `/signals/hub/list` | Hub signals for current trader |
| GET | `/signals/hub/logs` | Execution activity log |
| GET | `/signals/hub/execution/{signalId}` | Execution status |
| POST | `/signals/hub/resend/{signalId}` | Resend signal to Hub |
| GET | `/signals/hub/positions` | Open MT5 positions |
| POST | `/signals/hub/positions/{ticket}/close` | Close one position |
| POST | `/signals/hub/positions/close-all` | Close all positions |
| POST | `/signals/hub/callback` | Signal Hub auto-callback (done/failed → resolve TP/SL) |

### Trade outcome webhook

Notify the platform when a setup hits **TP** or **SL** so wallet balance and scoring update automatically.

**Endpoint:** `POST /api/v1/signals/webhook/outcome`

**Header:** `x-webhook-secret: <TRADE_OUTCOME_WEBHOOK_SECRET>`

**Body (explicit outcome):**
```json
{
  "signalId": "your-platform-signal-id",
  "outcome": "tp",
  "exit_price": 2650.5
}
```

**Body (Signal Hub–compatible):** Hub POSTs to your `callback_url` when a signal reaches `done` or `failed`. The same payload is accepted at `/signals/hub/callback` (no secret required — only registered `external_id` values are resolved):

```json
{
  "id": "hub-signal-uuid",
  "external_id": "your-platform-signal-id",
  "status": "done",
  "result": { "profit": 12.5 },
  "progress": { "stage": "closed", "message": "TP hit", "executed": true }
}
```

| Field | Description |
|-------|-------------|
| `signalId` / `external_id` | Platform signal ID from submit response |
| `outcome` | `"tp"` or `"sl"` (optional if `status` / `result` / `progress.message` is sent) |
| `exit_price` | Optional exit price (defaults to setup TP/SL) |
| `status` | Hub: `done` → TP, `failed` → SL |

Set `TRADE_OUTCOME_WEBHOOK_SECRET` in backend env. When submitting signals, the backend sends `callback_url` to Signal Hub if `API_PUBLIC_URL` is HTTPS (`…/api/v1/signals/hub/callback`).

### Uploads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploads/setup` | Upload chart screenshot |
| POST | `/uploads/setup/analyze` | AI chart analysis |
| POST | `/uploads/kyc` | Upload KYC document |

### Leaderboard & payouts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leaderboard` | Rankings |
| GET | `/leaderboard/my-rank` | Current user rank |
| GET | `/payouts` | Payout history |
| POST | `/payouts/request` | Request payout |
| POST | `/payouts/approve` | Approve payout (admin) |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/payments/registration` | Pay registration fee (USDT) |
| POST | `/payments/apply-promo` | Apply promo code |
| GET | `/payments/promo/validate` | Validate promo code |
| GET | `/payments/history` | Payment history |
| GET | `/payments/wallet` | Wallet transactions |
| GET | `/payments/{paymentId}/status` | Payment status |
| POST | `/payments/ipn` | NOWPayments IPN webhook |

### Admin & analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/dashboard` | Platform analytics |
| GET | `/admin/overview` | Admin dashboard |
| GET | `/admin/kyc/pending` | Pending KYC queue |
| POST | `/admin/kyc/{userId}/approve` | Approve KYC |
| POST | `/admin/kyc/{userId}/reject` | Reject KYC |
| GET | `/admin/users` | List users |
| POST | `/admin/users/{userId}/suspend` | Suspend user |
| GET | `/admin/signals` | List all signals |
| GET | `/admin/payouts` | List payouts |
| GET | `/admin/payouts/pending` | Pending payouts |
| POST | `/admin/payouts/{payoutId}/approve` | Approve payout |

## User Roles

- **Trader** — Submit signals, track performance, request payouts
- **Moderator** — Review suspicious activity, manage disputes
- **Admin** — Full platform management and analytics

## Project Structure

```
discover/
├── frontend/          # Next.js 15 app
│   ├── src/app/       # Pages (dashboard, submit, leaderboard...)
│   ├── src/components/# UI components
│   └── src/stores/    # Zustand state
├── backend/           # NestJS API
│   ├── src/auth/      # JWT + OAuth + Wallet auth
│   ├── src/signals/   # Signal submission + duplicate detection
│   ├── src/scoring/   # Trade scoring engine
│   ├── src/payouts/   # Weekly payout engine
│   ├── src/leaderboard/
│   └── prisma/        # Database schema
├── nginx/             # Reverse proxy config
└── docker-compose.yml
```

## Future-Ready Architecture

Designed to support:
- Copy Trading
- AI Trade Analysis
- Telegram Signal Bot
- Mobile App
- Multi-language Support
- Real Funded Accounts
- Broker API Integrations
- Affiliate Program

## License

Proprietary — All rights reserved.
