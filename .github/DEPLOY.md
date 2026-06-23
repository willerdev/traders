# Auto-deploy to Render

Every push to `main` triggers both Render deploy hooks via GitHub Actions.

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
