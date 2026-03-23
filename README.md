# QA Auditor

Automated website QA testing, broken link detection, SEO auditing, and A/B comparison tool.

## Stack

- **Frontend**: React + Vite + Tailwind → Vercel
- **Backend**: Node.js + Express + Playwright → Railway
- **Database**: Supabase (Postgres + Storage)

## Setup

See `/backend/README.md` and `/frontend/README.md` for service-specific setup.

## Monorepo structure

```
qa-auditor/
├── backend/      # Express API + Playwright scan engine
└── frontend/     # React dashboard
```
