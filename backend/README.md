# QA Auditor — Backend

Express + Playwright scan engine.

## Local setup

```bash
cd backend
npm install
npx playwright install chromium --with-deps
cp .env.example .env
# Fill in .env values
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default 3001) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (not anon key) |
| `FRONTEND_URL` | Frontend URL for CORS (e.g. https://qa-auditor.vercel.app) |

## Supabase setup

1. Create a new Supabase project
2. Go to SQL Editor → paste contents of `supabase-migration.sql` → run
3. Go to Storage → confirm `screenshots` bucket exists and is public
4. Copy your project URL and **service role** key (Settings → API)

## Railway deploy

1. Create new Railway project → link to this GitHub repo
2. Set root directory to `/backend`
3. Add all env vars in Railway dashboard
4. Railway auto-deploys on push — `railway.toml` handles Playwright install

## API

| Method | Path | Description |
|---|---|---|
| POST | `/scan` | Start a scan `{ url_a, url_b? }` |
| GET | `/scan` | List recent scans |
| GET | `/scan/:id` | Poll scan status + progress |
| GET | `/scan/:id/report` | Get full report |
| GET | `/health` | Health check |
