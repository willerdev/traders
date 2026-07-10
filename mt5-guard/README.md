# MT5 Guard

Focused mobile companion for **TraderRank Pro** — Wallet, MT5 terminal, and Settings only. Everything else opens in the web app.

## Stack

- Expo SDK 57 + React Native + TypeScript
- React Navigation (auth stack + 3 bottom tabs)
- Expo Secure Store for JWT
- REST API only (no direct database)

## Setup

```bash
cd mt5-guard
cp .env.example .env
npm install
npm start
```

**Expo Go:** This project targets **Expo SDK 56** so it runs in the Play Store / App Store Expo Go app. SDK 57 is not yet available in store builds of Expo Go — updating the app on your phone will not help until Expo ships that release.

## Environment

| Variable | Default |
|----------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | `https://traders-c53s.onrender.com/api/v1` |
| `EXPO_PUBLIC_WEB_APP_URL` | `https://thetradeguard.com` |

## Tabs

1. **Wallet** — balance, deposit, withdraw, transactions
2. **MT5** — Quotes · Charts · Trade · History (1s running/quotes poll, Real/Demo badge)
3. **Settings** — profile, linked MT5 account, Live Sync, web links

## Auth

- `POST /auth/login` → JWT or OTP flow
- Token stored in Secure Store
- `GET /users/dashboard` gates MT5 on `tradingAccessActive`

## Test credentials

Provide to developers separately (never commit):

- Active trader email/password with weekly access
- Optional copy-owner account for Real badge testing

## Build

```bash
npx expo prebuild
eas build --platform ios
eas build --platform android
```

## Reference (web repo)

- `frontend/src/lib/api.ts` — API types and paths
- `frontend/src/hooks/use-mt5-terminal.ts` — polling cadence
- `frontend/src/app/mt5/page.tsx` — MT5 UX reference

## Third-party AI prompts

See [`THIRD_PARTY_PROMPTS.md`](./THIRD_PARTY_PROMPTS.md) for copy-paste Step 1–3 prompts and credentials checklist.
