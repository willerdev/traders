# Trade Guard Solo (snapshot)

Investor-only UI lives in a **separate repo**: [willerdev/soloema-web](https://github.com/willerdev/soloema-web).

This `solo/` folder is a snapshot in the traders monorepo. Deploy the frontend from **soloema-web**. The API stays here: `APP_VARIANT=solo` → **solo-api**.

## Local (monorepo)

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

## Deploy

See `.github/DEPLOY.md` and the soloema-web README.
