# TraderRank Pro — React Native Mobile App (Third-Party Build Prompt)

**Copy everything below the line and give it to the contractor.**  
Attach or grant read access to: `frontend/src/lib/api.ts`, Swagger at `/api/docs`, and (optional) `mt5-guard/` as a reference implementation for Wallet + MT5 patterns only.

---

## Role

You are building a production **React Native** mobile app (prefer **Expo**, managed workflow + EAS) for **TraderRank Pro** (brand site: https://thetradeguard.com).

This is a **full consumer app** for traders, depositors, and investors — not an admin console and not a thin WebView wrapper. Use native screens, navigation, secure token storage, and the existing REST API.

Deliver in **exactly three stages**. Each stage must be demoable, mergeable, and shippable on its own. Do not start Stage N+1 until Stage N acceptance criteria pass.

---

## Product (one paragraph)

TraderRank Pro is a trader talent-discovery and capital platform. Users submit trade setups, compete on a weekly leaderboard, trade on virtual funded accounts, deposit USDT into a platform wallet, enroll as investors for yield (optional VIP), claim TP rewards, request payouts, and chat with Support Agent / human admin. Payments are USDT via NOWPayments (and Mobile Money where supported). One account can trade, deposit, and invest.

---

## Non-negotiable business rules

1. **KYC is required for payouts only** — not for registration, setup submit, or viewing most of the app.
2. **Trader payout split:** **40% trader / 60% platform** of virtual profit (show clearly on payouts UI).
3. **ACTIVE** account status requires **registration payment** (crypto/MoMo) **or a valid promo** after email verification.
4. **Virtual account:** starts at **$1,000** (Bronze), **5% risk per trade**; tiers Bronze → Silver → Gold → Diamond → Elite ($25K).
5. **Investor VIP (~$20/month):** $0 withdrawal fee; support Agent can help with wallet ↔ investment transfers and (VIP) approve pending withdrawals after **30 minutes** — wire UI to existing Messages/Agent APIs; do not invent server-side VIP rules.
6. **Never embed secrets** in the app: no `JWT_SECRET`, `METAAPI_TOKEN`, database URLs, NOWPayments private keys, or admin credentials. Client only uses public API base URL + user JWT.
7. **Do not build:** admin panel, local-admin, marketing blast tools, Signal Hub webhooks, or server-side MetaAPI provisioning UI beyond what public APIs already expose.

---

## Technical stack (required)

| Area | Choice |
|------|--------|
| Framework | React Native + **Expo** (SDK current stable) |
| Language | TypeScript (strict) |
| Navigation | Expo Router or React Navigation 6+ (tabs + stacks) |
| Data | Fetch or TanStack Query; typed API client mirroring web |
| Auth storage | Expo SecureStore (never AsyncStorage for JWT) |
| Forms | Controlled inputs + validation (Zod or equivalent) |
| Images / KYC / setups | `expo-image-picker` + multipart upload endpoints |
| Deep links | Password reset / email verify can open web or in-app handlers |
| Env | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WEB_APP_URL=https://thetradeguard.com` |

**API**

- Base: `https://traders-c53s.onrender.com/api/v1` (confirm with client if changed)
- Swagger: `{API_HOST}/api/docs`
- Auth header: `Authorization: Bearer <accessToken>`
- Canonical client reference: web `frontend/src/lib/api.ts` — **mirror paths and response shapes**; do not invent endpoints.

**Existing mobile reference (optional, Stage 3 only):** repo folder `mt5-guard/` — Expo app with Wallet + MT5 terminal + Settings only. Reuse patterns; do not limit the new app to those three tabs.

---

## Design system

Dark trading UI (default):

| Token | Value |
|-------|--------|
| Background | `#121a2e` |
| Surface | `#1a2438` |
| Foreground | `#F8FAFC` |
| Muted | `#94A3B8` |
| Primary | `#2563EB` |
| Success / Danger | `#22C55E` / `#EF4444` |
| Accent gold | `#FBBF24` |
| MT5 buy / sell | `#4a9eff` / `#ff5252` |

- One clear visual language: navy surfaces, blue primary, gold for rank/VIP accents.
- Mobile-first: bottom tabs, large tap targets, safe areas, pull-to-refresh on money screens.
- Do **not** use generic purple SaaS gradients or cream/serif “AI landing” aesthetics.
- Support system font scaling; test on small Android phones.
- Optional light theme is nice-to-have, not Stage 1.

---

## Auth (all stages that are logged-in)

Implement and keep stable:

- Email + password **register** / **login**
- Login **OTP** when API returns `{ requiresOtp, loginSessionId }` → verify + resend
- Forgot password → deep link or open web `https://thetradeguard.com/forgot-password`
- Persist session; 401 → clear token → login
- Email verify: handle via web or in-app if `GET /auth/verify-email` is usable

**Do not assume Google OAuth works** unless the client confirms a live mobile OAuth endpoint. Wallet (signed message) login exists on API — Stage 2+ optional.

---

# STAGE 1 — Foundation & cash core (MVP)

**Goal:** A user can register/login, see account health, deposit, invest basics, withdraw/request payouts, complete KYC, and contact support. No full MT5 terminal yet.

## Screens & flows

1. **Splash / session restore**
2. **Login / Register** (+ OTP step)
3. **Home / Dashboard** — balances summary, registration/ACTIVE gate CTA, virtual account snapshot if present, shortcuts
4. **Wallet**
   - Available / locked / investment balances
   - Deposit (create payment → show address / MoMo instructions + status polling)
   - Withdraw to saved wallet (OTP confirm flow if API requires)
   - Transaction history
5. **Invest**
   - Status, allocate / redeem wallet ↔ investment
   - Pause/resume if API supports
   - VIP status + upgrade checkout
6. **Journal** — income / daily credits calendar or list (`income-journal` / related APIs)
7. **Payouts** — history, request payout when applicable, destination display
8. **Settings**
   - Profile, preferred currency (USDT vs local if API returns rates)
   - Payout method (TRC20 / Mobile Money) + saved wallets
   - **KYC** upload + submit + status
   - Links: open web for anything not yet native
9. **Messages (Support)**
   - Thread list/chat UI
   - Send message; show Agent replies
   - **Speak to admin** / **Chat with Agent** (resume) using existing endpoints
10. **Registration payment / promo** — if user is not ACTIVE, guided pay or apply promo

## Stage 1 API groups (minimum)

`/auth/*` · `/users/dashboard` · `/users/settings` · `/users/kyc*` · `/wallet/*` · `/investor/*` · `/payouts/*` · `/messages/*` · `/payments/registration*` · `/payments/promo*` · `/uploads/kyc*` · `/notifications` (badge optional)

## Stage 1 deliverables

- [ ] Expo app runs on iOS Simulator + Android emulator
- [ ] EAS build profiles (development + preview)
- [ ] Typed API module + SecureStore auth
- [ ] Bottom tabs: Home · Wallet · Invest · Messages · Settings (or equivalent clear IA)
- [ ] Empty / loading / error states on money screens
- [ ] README: env vars, how to run, TestFlight/Play internal notes
- [ ] Short Loom/video walkthrough of deposit → invest → withdraw/KYC → support chat

## Stage 1 acceptance

- Fresh user can register, hit registration payment (or promo), reach usable home.
- Confirmed deposit appears in wallet after polling (or manual refresh).
- Investor allocate/redeem updates balances from API.
- Withdrawal request creates pending payout visible in app.
- KYC submit returns status `PENDING`/`APPROVED` correctly.
- Support chat sends/receives; escalate + resume agent works when API supports it.
- No secrets in repo; crash-free happy path on mid-range Android.

**Out of Stage 1:** MT5 charts/trading, setup submit, leaderboard, TP claims, copy trading, evaluations, Google login.

---

# STAGE 2 — Trader competition & claims

**Goal:** Full “talent discovery” loop on mobile: submit setups, leaderboard, TP claims, trader payouts polish, referrals, notifications.

## Add screens & flows

1. **Submit setup** — form (symbol, direction, entry, SL, TP, RR, description) + screenshot upload; drafts if API supports; list open/unresolved setups
2. **Leaderboard** — current week ranks, user highlight
3. **TP Claims** — list, status, evidence resubmit, request claim payout
4. **Payouts (trader)** — weekly/TP/profit-share flows already partially in Stage 1; finish request + address UX
5. **Referrals** — code, share sheet, stats from `/referrals/me`
6. **Notifications** — in-app list + badge; mark read if API allows
7. **Dashboard enrichment** — unresolved setups, access expiry / trading access CTA, rank tier
8. **Deep links** — password reset, optional notification taps

## Stage 2 API groups (add)

`/signals*` · `/uploads/setup*` · `/leaderboard` · `/tp-claims*` · `/referrals/*` · `/notifications*` · remaining `/payments/*` used by web for setup-plan / profit-share if product still uses them

## Stage 2 deliverables

- [ ] Submit setup with image upload end-to-end
- [ ] Leaderboard matches web for current week
- [ ] TP claim lifecycle usable without opening web
- [ ] Push notifications **optional** (FCM/APNs) — if skipped, document and keep in-app inbox
- [ ] Accessibility pass on forms; offline toast when API unreachable

## Stage 2 acceptance

- User submits a setup; it appears on dashboard/list.
- Leaderboard loads; pull-to-refresh works.
- TP claim can be opened and evidence uploaded when status requires it.
- Referral code share works on device.
- Stage 1 cash flows still pass regression.

**Out of Stage 2:** Full MetaAPI MT5 terminal, copy-pool owner tools, evaluations product (unless client re-enables).

---

# STAGE 3 — MT5 terminal, polish, store release

**Goal:** Parity with web MT5 experience where APIs allow; production hardening; App Store / Play Store submission package.

## Add screens & flows

1. **MT5 hub** (reference `mt5-guard/` + web `/mt5`)
   - Quotes
   - Chart (reasonable mobile chart lib; candlesticks from existing quote/history APIs)
   - Trade ticket (buy/sell) respecting `tradingAccessActive` gate
   - Open positions / history
   - Real vs Demo badge if API provides
2. **MT5 Live Sync / link** — Settings flows from `/mt5-sync/*` and web Settings (link request, status, renew payment if required)
3. **Copy trading** — **read-only or light** consumer view if APIs are safe for mobile; **owner/admin copy-pool management can stay web** unless client insists
4. **Wallet login (optional)** — MetaMask / WalletConnect only if client prioritizes; otherwise skip
5. **App polish**
   - Biometric unlock for returning users (optional, JWT still in SecureStore)
   - Force-update / soft-update check
   - Analytics (privacy-safe) + crash reporting (Sentry or equivalent)
   - Performance: list virtualization, image caching
6. **Store release**
   - App icons, splash, screenshots, privacy policy URL (thetradeguard.com), data safety form
   - iOS + Android production EAS profiles
   - TestFlight + Play internal testing → production checklist

## Stage 3 API groups (add)

`/signals/mt5/*` (or whatever paths `api.ts` + mt5-guard use) · `/mt5-sync/*` · copy endpoints only if in scope

## Stage 3 deliverables

- [ ] MT5 quotes + trade + history usable when trading access is active
- [ ] Clear CTA to renew access when `tradingAccessActive` is false (deep link wallet/payments)
- [ ] Store listing assets + privacy questionnaire filled with client
- [ ] Final regression of Stages 1–2
- [ ] Handoff doc: architecture, env, release process, known API gaps

## Stage 3 acceptance

- Demo account can view quotes and place a trade when backend access is active.
- Expired access shows renewal path (no silent failures).
- App passes client UAT checklist; builds install from TestFlight and Play internal track.
- No embedded secrets; ProGuard/R8 / ATS configured sanely.

---

## Cross-cutting engineering requirements (all stages)

1. **Single API client** — base URL from env; intercept 401; typed errors showing server `message`.
2. **Money formatting** — always show currency from settings (USDT default); never invent FX client-side without API rates.
3. **Idempotent UX** — disable double-submit on deposit/withdraw/invest/VIP.
4. **Polling** — payment status and support chat: sensible intervals + cleanup on unmount.
5. **Security** — HTTPS only; no logging of JWT or full wallet private data; redact PII in crash logs.
6. **Testing** — unit tests for money helpers + API mappers; detox/Maestro smoke for login + wallet home (Stage 2+).
7. **Git** — feature branches per stage; conventional commits; CHANGELOG per stage tag (`mobile-stage-1`, etc.).

---

## What the client will provide

- API base URL + test accounts (trader with funds, KYC-approved, VIP if needed)
- Figma optional — otherwise match web dark UI + tokens above
- Apple Developer + Google Play access (or build locally and hand `.aab` / IPA)
- Confirmation whether **evaluations** and **Google OAuth** are in or out
- Read access to monorepo: especially `frontend/src/lib/api.ts`, `mt5-guard/`, `docs/`

---

## Explicit out of scope (unless change order)

- Admin / staff tools  
- Rewriting the Nest backend  
- Custodial key management / seed phrases  
- Guaranteeing NOWPayments or MoMo success (handle pending/failed states only)  
- Replacing the marketing website  

---

## Suggested timeline (indicative)

| Stage | Focus | Indicative duration |
|-------|--------|---------------------|
| **1** | Auth, Wallet, Invest, KYC, Payouts, Support | 3–5 weeks |
| **2** | Submit, Leaderboard, TP Claims, Referrals | 2–4 weeks |
| **3** | MT5, polish, store release | 3–5 weeks |

Adjust after kickoff once API access and design fidelity are confirmed.

---

## Kickoff checklist for contractor

1. Clone API types from `frontend/src/lib/api.ts`.  
2. Hit Swagger `/api/docs` and confirm auth + wallet flows with a test user.  
3. Scaffold Expo app + SecureStore + tab navigation.  
4. Deliver Stage 1 vertical slice: **login → wallet summary → support message**.  
5. Demo Stage 1 → sign-off → Stage 2 → sign-off → Stage 3 → store submit.

---

## One-line mission

**Ship a dark, native TraderRank Pro app that makes deposit, invest, withdraw, compete, and support feel first-class on iOS and Android — in three locked stages, against the existing `/api/v1` backend only.**
