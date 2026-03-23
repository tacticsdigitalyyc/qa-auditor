# QA Auditor — Frontend

React + Vite + Tailwind dashboard.

## Local setup

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL=http://localhost:3001
npm run dev
```

## Vercel deploy

1. Import repo in Vercel
2. Set root directory to `/frontend`
3. Add env var: `VITE_API_URL=https://your-railway-backend.up.railway.app`
4. Deploy
