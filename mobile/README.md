# TraderRank Pro — Mobile (Stage 1)

Native Expo app for traders, depositors, and investors. Mirrors `frontend/src/lib/api.ts` against `/api/v1`.

## Stack

- Expo SDK 56 (managed) + TypeScript
- React Navigation (tabs + stacks)
- Expo SecureStore for JWT (never AsyncStorage)
- Dark navy UI (`#121a2e` / `#1a2438` / `#2563EB` / `#FBBF24`)

> **Note:** SDK 57 Expo Go is not on the Play Store yet. This app targets **SDK 56** so it runs in the current Expo Go. Upgrade later once store Expo Go ships 57.

## Env

Copy `.env.example` → `.env` (or set in EAS secrets):

```
EXPO_PUBLIC_API_BASE_URL=https://traders-c53s.onrender.com/api/v1
EXPO_PUBLIC_WEB_APP_URL=https://thetradeguard.com
```

Never put `JWT_SECRET`, `METAAPI_TOKEN`, DB URLs, or NOWPayments private keys in the app.

## Run

```bash
cd mobile
npm install
npx expo start
```

Then press `i` (iOS Simulator) or `a` (Android emulator), or scan the QR with Expo Go.

## EAS builds

1. `npm i -g eas-cli && eas login`
2. Replace `extra.eas.projectId` in `app.json` via `eas init`
3. Profiles in `eas.json`:
   - `development` — dev client
   - `preview` — internal APK / ad-hoc
   - `production` — store builds

```bash
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

### TestFlight / Play internal

- iOS: `eas submit --platform ios --profile production` after Apple Developer access
- Android: upload the preview/production AAB to Play Console internal testing track

## Stage 1 tabs

Home · Wallet · Invest · Messages · Settings

Includes: auth + OTP, registration payment/promo, deposit/withdraw, investor allocate/redeem/VIP, income journal, payouts (40/60), KYC upload, support chat (agent + escalate).

**Out of Stage 1:** MT5 terminal, setup submit, leaderboard, TP claims, copy trading, Google OAuth.

## API reference

Canonical client: `../frontend/src/lib/api.ts`  
Swagger (when enabled on host): `{API_HOST}/api/docs`  
Optional MT5 patterns only: `../mt5-guard/`

## Demo checklist

1. Register (invite code) → login (+ OTP if required)
2. Home → Activate account (pay or promo)
3. Wallet → Deposit → poll until confirmed → Invest allocate
4. Settings → KYC submit → PENDING
5. Messages → send + Speak to admin / resume Agent

## Tests

```bash
npm run typecheck
npm test
```
