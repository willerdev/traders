# Auto-deploy to Render

Every push to `main` triggers Render deploy hooks via GitHub Actions.

## Real services (ignore email failures for others)

| Render name | Role | Live URL |
|-------------|------|----------|
| **traders-api** | NestJS API (main Trade Guard) | `https://traders-c53s.onrender.com` |
| **traders-web** | Next.js frontend | `https://thetradeguard.com` |
| **solo-api** | NestJS API (`APP_VARIANT=solo`, start: `npm run start:solo`) | `https://<solo-api>.onrender.com` (after create) |
| **solo-web** | Next.js Solo UI (`rootDir: solo`) | `https://<solo-web>.onrender.com` (after create) |

If you get a Render email that **`traders-1`** failed: that is almost always an **extra/orphaned** service auto-connected to this repo (wrong root directory / build command). It is **not** traders-api, traders-web, solo-api, or solo-web.

**Fix:** Render Dashboard → **traders-1** → Settings → turn off **Auto-Deploy**, or delete the service. Keep auto-deploy only on the four named services above (or rely on the GitHub deploy hooks below).

Solo `rootDir` must be `backend` (API) and `solo` (web). Do not point Solo at `frontend/`.

## Trade Guard Solo (one-time ops)

Solo is a **second product**. It does **not** share the traders database or JWT.

### 1. Neon

1. Create a **new** Neon project (or a new database on a separate project).
2. Copy that `DATABASE_URL` into **solo-api only**.
3. Do **not** paste the traders `DATABASE_URL`. Schema is the same (`prisma db push` on boot); data starts empty.

### 2. Render `solo-api`

Create a Web Service from this repo (or apply `render.yaml` Blueprint):

| Setting | Value |
|---------|--------|
| Name | `solo-api` |
| Root | `backend` |
| Build | `npm install && npx prisma generate && npm run build` |
| Start | `npm run prisma:push && npm run start:solo` |
| Health | `/api/v1/health` |

Env:

- **New:** `DATABASE_URL`, `JWT_SECRET`, `APP_VARIANT=solo`
- **`FRONTEND_URL` / `PUBLIC_APP_URL`:** Solo site origin (e.g. `https://solo-web-xxxx.onrender.com`)
- **`API_PUBLIC_URL`:** Solo API origin (e.g. `https://solo-api-xxxx.onrender.com`) so NOWPayments **per-invoice** `ipn_callback_url` hits this host (`/api/v1/payments/ipn`)
- **Copy from traders-api:** `NOWPAYMENTS_*`, `FLW_*`, `RESEND_API_KEY`, `EMAIL_FROM`, plus S3 keys if contract document uploads are used. Solo MT5 charts use a **per-user MetaAPI token pasted in Settings** — do not put `METAAPI_TOKEN` on solo-api.

Account-level NOWPayments IPN can only point at one URL. Solo invoices already send a per-payment callback to `API_PUBLIC_URL`. If IPN is global-only in the dashboard, use a second NOWPayments store or an IPN router. Same API keys are OK if callbacks reach solo-api.

### 3. Render `solo-web`

| Setting | Value |
|---------|--------|
| Name | `solo-web` |
| Root | `solo` |
| Build / start | same pattern as traders-web (`npm install && npm run build` / `npm start`) |

Env:

- `API_URL` = `https://<solo-api>.onrender.com`
- `NEXT_PUBLIC_API_URL` = `https://<solo-api>.onrender.com/api/v1`
- Copy contract/MoMo `NEXT_PUBLIC_*` from traders-web if using the same chain

Custom domain is optional; ship `*.onrender.com` first.

### 4. GitHub secrets

In [GitHub → Settings → Secrets → Actions](https://github.com/willerdev/traders/settings/secrets/actions), add:

| Secret | Value |
|--------|--------|
| `RENDER_DEPLOY_HOOK_API` | Backend deploy hook URL (traders-api) |
| `RENDER_DEPLOY_HOOK_WEB` | Frontend deploy hook URL (traders-web) |
| `RENDER_DEPLOY_HOOK_SOLO_API` | solo-api deploy hook (omit until the service exists) |
| `RENDER_DEPLOY_HOOK_SOLO_WEB` | solo-web deploy hook (omit until the service exists) |

Or from your machine (with `gh` CLI):

```bash
gh secret set RENDER_DEPLOY_HOOK_API --body "https://api.render.com/deploy/srv-...?key=..."
gh secret set RENDER_DEPLOY_HOOK_WEB --body "https://api.render.com/deploy/srv-...?key=..."
gh secret set RENDER_DEPLOY_HOOK_SOLO_API --body "https://api.render.com/deploy/srv-...?key=..."
gh secret set RENDER_DEPLOY_HOOK_SOLO_WEB --body "https://api.render.com/deploy/srv-...?key=..."
```

Solo deploy steps in the workflow are skipped until those secrets are set.

Workflow file: `.github/workflows/deploy-render.yml`
