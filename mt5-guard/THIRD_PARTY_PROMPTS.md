# MT5 Guard — Third-Party AI Build Prompts

Copy each step to a third-party AI in order. The app in this folder implements all three steps.

## Connection config (Step 3)

| Item | Value |
|------|-------|
| `API_BASE_URL` | `https://traders-c53s.onrender.com/api/v1` |
| `WEB_APP_URL` | `https://thetradeguard.com` |

**Do NOT** embed `JWT_SECRET`, `METAAPI_TOKEN`, or database URLs in the app.

Provide test credentials separately (never commit):

- Active trader email/password with weekly access
- Optional copy-owner account for Real badge testing

---

## STEP 1 — Skeleton prompt

```
Build "MT5 Guard" — a mobile app (React Native Expo + TypeScript preferred) with ONLY 3 bottom tabs:

1. Wallet
2. MT5
3. Settings

Requirements for Step 1 (skeleton only — no real API yet):
- Expo project with TypeScript, React Navigation bottom tabs
- Dark MT5-style theme matching a trading terminal (dark bg #1a1d24, buy blue #4a9eff, sell red #ff5252)
- Auth screens: Login, OTP (placeholder), Forgot password link opening web
- Wallet tab: placeholder balance card + Deposit/Withdraw buttons + empty transaction list
- MT5 tab: bottom sub-nav matching web — Quotes | Charts | Trade | History
  - Header with title + Real/Demo badge placeholder
  - Empty states for each sub-tab
- Settings tab: sections — Profile, Address, Payout, Linked MT5 Account, MT5 Live Sync, Logout
- Secure token storage abstraction (SecureStore interface, mock token for now)
- API client module stub with base URL constant: https://traders-c53s.onrender.com/api/v1
- Environment config: API_BASE_URL (prod), WEB_APP_URL (for deep links to full web app)
- No direct database — REST only

Deliver: runnable Expo app, folder structure, navigation, themed components, mock data.
```

---

## STEP 2 — Functionality prompt

```
Continue MT5 Guard (Step 2 — wire UI logic with mock/local state, still optional live API).

Implement full screen behavior:

## Auth
- Login form validation (email/password)
- OTP 6-digit input with resend cooldown UI
- Persist session after login; auto-open MT5 tab
- Logout clears secure storage

## Wallet tab
- Summary card: availableBalance, lockedBalance, totalDeposited, totalEarned, totalWithdrawn
- Active depositor plan display if present
- Transaction list (paginated UI, pull-to-refresh)
- Deposit modal: network picker (TRC20/ERC20/BEP20), amount, risk % slider, preview before confirm
- Withdraw modal: pick saved verified wallet, amount, fee notice
- Saved withdrawal wallets list + add flow (label, address, network, email OTP confirm UI)

## MT5 tab (match web behavior)
- Account mode badge: Real (copy_live | linked_live | investor_live) or Demo (virtual)
- Account summary rows: Balance, Profit, Floating, Equity
- Quotes: list symbols with bid/ask/mid, 1s refresh when tab active
- Charts: symbol picker, timeframe M1/M5/M15/H1/H4/D1, candlestick chart area, Buy/Sell buttons
- Trade: running positions list, close single, close all, swipe actions
- History: sub-tabs Positions | Orders | Deals
- Place order modal (Buy/Sell):
  - Show market entry, volume, default SL pips, editable SL/TP
  - When SL changes, auto-recalculate TP at 1:1 RR unless user manually edited TP
- Real/Demo badge in header only (do not duplicate in footer)

## Settings tab
- Load/edit profile (displayName, phone, DOB)
- Address form
- Payout method (TRC20 or Mobile Money fields)
- Linked MT5 account: list pool accounts, select, claim new account (accountName, login, password, server)
- MT5 Live Sync toggle + status card (active/expired, linked account)
- Link "Manage copy pool" → open WEB_APP_URL/mt5/copy in browser (copy owners only)

## Polling (critical for live feel)
- GET running trades: every 1 second when MT5 Trade or Charts tab visible
- GET quotes: every 1 second on Quotes/Charts
- GET terminal full snapshot: every 5 seconds on Charts
- Pause polling when app backgrounded; resume on foreground
- Show subtle "syncing" indicator during refresh; keep last snapshot on error

## Web handoff
- Settings footer links: "Submit setups", "Leaderboard", "Payouts" → open in system browser

Use TypeScript interfaces matching the API shapes (mock until Step 3).
```

---

## STEP 3 — Connectivity prompt

```
Continue MT5 Guard (Step 3 — connect to production REST API).

## Connection config
API_BASE_URL = "https://traders-c53s.onrender.com/api/v1"
WEB_APP_URL = "https://thetradeguard.com"

All requests: Authorization: Bearer <token> except /auth/* login/register.

## Auth endpoints
POST /auth/login
  body: { email, password }
  → { accessToken, user } OR { requiresOtp: true, loginSessionId, email, expiresIn }

POST /auth/login/verify-otp
  body: { loginSessionId, code }

POST /auth/login/resend-otp
  body: { loginSessionId }

POST /auth/forgot-password
  body: { email }  // then open web reset flow

## Dashboard gate (call after login)
GET /users/dashboard
  → user.tradingAccessActive, user.accessExpiresAt, user.adminPermissions.copy
  Block MT5 trading if tradingAccessActive is false.

## Wallet endpoints
GET /wallet/summary
GET /wallet/transactions?take=50&skip=0
GET /wallet/deposit/minimum?network=TRC20
GET /wallet/deposit/preview?amount=&riskPercent=
POST /wallet/deposit  { network, amount, riskPercent? }
POST /wallet/withdraw  { amount, savedWalletId }
GET /wallet/withdrawal-wallets
POST /wallet/withdrawal-wallets/request-verification  { label, address, network }
POST /wallet/withdrawal-wallets/confirm  { sessionId, code }
DELETE /wallet/withdrawal-wallets/:id

## MT5 endpoints
GET /signals/mt5/terminal
GET /signals/mt5/running          // poll 1s
GET /signals/mt5/quotes           // poll 1s
GET /signals/mt5/quote?symbol=XAUUSD
GET /signals/mt5/ohlc?symbol=XAUUSD&timeframe=M5&limit=200
GET /signals/mt5/order-preview?symbol=XAUUSD&direction=BUY
POST /signals/mt5/orders  { symbol, direction, stopLoss, takeProfit }
POST /signals/mt5/positions/:positionId/close
POST /signals/mt5/positions/:positionId/modify-stops  { stopLoss?, takeProfit? }
POST /signals/mt5/positions/close-all
POST /signals/:signalId/close-trade
POST /signals/:signalId/set-breakeven
POST /signals/:signalId/partial-close  { volume }
POST /signals/:signalId/update-stops  { stopLoss?, takeProfit? }

## Settings endpoints
GET /users/settings
PATCH /users/profile  { displayName?, firstName?, lastName?, phone?, dateOfBirth? }
PATCH /users/address  { country?, state?, city?, addressLine1?, addressLine2?, postalCode? }
PATCH /users/payment-details  { payoutMethod, trc20Address?, mobileMoneyProvider?, ... }
PATCH /users/trading-account  { metaApiAccountId }
POST /users/trading-account/claim  { accountName, login, password, server }
GET /signals/metaapi/accounts

## MT5 Live Sync
GET /mt5-sync/status
POST /mt5-sync/enabled  { enabled: boolean }
GET /mt5-sync/pool-accounts
POST /mt5-sync/claim-account  { accountName, login, password, server }

## Error handling
- 401 → logout + login screen
- 403 weekly access → show renewal CTA linking to WEB_APP_URL/wallet or /dashboard
- 503 MetaAPI not configured → show server message
- Render cold start: show "Server waking up" after 12s timeout; retry

## 1:1 TP auto-calc (client-side when SL edits)
function computeOneToOneTp(direction, entry, stopLoss):
  risk = abs(entry - stopLoss)
  return direction === "BUY" ? entry + risk : entry - risk

## Reference implementation
Mirror behavior from existing web repo paths:
- frontend/src/lib/api.ts (all types + paths)
- frontend/src/hooks/use-mt5-terminal.ts (polling cadence)
- frontend/src/app/mt5/page.tsx (tab UX)
- frontend/src/app/wallet/page.tsx
- frontend/src/app/settings/page.tsx

Deliver: production-ready app with real API, secure token storage, error states, and App Store / Play Store build config.
```

---

## Credentials checklist

| Item | Give to developer? | Notes |
|------|-------------------|-------|
| `API_BASE_URL` | Yes | Production Render backend |
| `WEB_APP_URL` | Yes | Frontend for deep links |
| Test user email/password | Yes | Active trader with weekly access |
| Copy-owner test user | Optional | Real badge + copy balance |
| `JWT_SECRET` | **No** | Server-only |
| `METAAPI_TOKEN` | **No** | Server-only |
| Neon `DATABASE_URL` | **No** | Never in mobile app |
