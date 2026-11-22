# Bootcamp App

A QA workspace: test cases, test suites, test runs, bug tracking, reports and a dashboard.
Express 5 server with a SQLite database, and a React 19 client built with Vite.

## Run it locally

Needs Node.js 24.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The server runs on port 3001 and fills a new database with sample data
the first time. To turn on Discord alerts for failed test cases, copy `.env.example` to `.env` and
set `DISCORD_WEBHOOK_URL`.

## DEPLOY

The app deploys to [Render](https://render.com) as one free web service. Render runs
`npm ci --include=dev && npm run build`, then `npm start`: the Express server serves the API and
the built React app from the same address. Everything Render needs is in `render.yaml`.

### Free tier: what to expect

Checked November 2026 against [Render's free tier docs](https://render.com/docs/free):

- **Cost:** $0. 750 free instance hours a month per workspace, enough for one always-on service.
  No card needed.
- **Sleeps when idle:** after 15 minutes with no visits the service stops. The next visit wakes it,
  which takes about a minute.
- **Data does not last:** the free tier has no persistent disk, so the SQLite database starts
  again from the sample data every time the service sleeps, restarts or is redeployed. Fine for a
  demo; for real use, upgrade to a paid instance and add a disk (set `DB_PATH` to a path on it).
- **One instance**, 512 MB memory, 0.1 CPU.

### First deploy

1. Commit your work and push it to GitHub (`main` branch).
2. Open the Blueprint link, sign in to Render (with GitHub), and click **Deploy Blueprint**:

   ```bash
   open "https://render.com/deploy?repo=https://github.com/xTFxRay/Bootcamp"
   ```

   Render asks for `DISCORD_WEBHOOK_URL`. Paste your webhook to get alerts, or leave it empty.
3. Wait for the first build (a few minutes). The public address appears at the top of the
   service's page, for example `https://bootcamp-app.onrender.com`.

### Later deploys

Every push to `main` deploys again automatically.

### Environment variables

See `.env.example`. On Render:

| Variable | Needed | What it does |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | no | Discord alerts for failed test cases; set in Render, never in a file |
| `APP_URL` | no | Address used in alert links; defaults to Render's own address |
| `PORT` | set by Render | Port the server listens on |
| `DB_PATH` | no | Where the database file goes; only useful with a paid disk |
| `NODE_VERSION` | set in `render.yaml` | Node.js version for the build |

### Removing it

In the Render dashboard, open the service → **Settings** → **Delete Web Service**.
