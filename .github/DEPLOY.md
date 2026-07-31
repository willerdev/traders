# Auto-deploy to Render

Every push to `main` triggers both Render deploy hooks via GitHub Actions.

## Real services (ignore email failures for others)

| Render name | Role | Live URL |
|-------------|------|----------|
| **traders-api** | NestJS API | `https://traders-c53s.onrender.com` |
| **traders-web** | Next.js frontend | `https://thetradeguard.com` |

If you get a Render email that **`traders-1`** failed: that is almost always an **extra/orphaned** service auto-connected to this repo (wrong root directory / build command). It is **not** traders-api or traders-web.

**Fix:** Render Dashboard → **traders-1** → Settings → turn off **Auto-Deploy**, or delete the service. Keep auto-deploy only on traders-api and traders-web (or rely on the GitHub deploy hooks below).

## One-time setup (GitHub repository secrets)

In [GitHub → Settings → Secrets → Actions](https://github.com/willerdev/traders/settings/secrets/actions), add:

| Secret | Value |
|--------|--------|
| `RENDER_DEPLOY_HOOK_API` | Backend deploy hook URL (traders-api) |
| `RENDER_DEPLOY_HOOK_WEB` | Frontend deploy hook URL (traders-web) |

Or from your machine (with `gh` CLI):

```bash
gh secret set RENDER_DEPLOY_HOOK_API --body "https://api.render.com/deploy/srv-...?key=..."
gh secret set RENDER_DEPLOY_HOOK_WEB --body "https://api.render.com/deploy/srv-...?key=..."
```

Workflow file: `.github/workflows/deploy-render.yml`
