# Trade Guard Solo

Investor-only product: login, wallet, Smart Invest, blockchain contract, settings.

Not thetradeguard.com. Uses its own Nest process (`APP_VARIANT=solo`) and its own database.

## Local

API (port **4001**):

```bash
cd backend
APP_VARIANT=solo DATABASE_URL=... npm run start:solo:dev
```

Web (port **3001**):

```bash
cd solo
NEXT_PUBLIC_API_URL=http://localhost:4001/api/v1 npm run dev
```

The Next proxy (`API_URL`) defaults to `http://localhost:4001`.

## Deploy

See `.github/DEPLOY.md` (Neon + Render `solo-api` / `solo-web`).
