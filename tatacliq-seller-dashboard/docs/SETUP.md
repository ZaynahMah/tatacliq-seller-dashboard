# Setup Guide

End-to-end setup for the TataCLiQ Seller Dashboard, from a fresh clone to a running dev environment.

---

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS |
| pnpm or npm | latest |
| Python | 3.11+ |
| Docker + Docker Compose | latest |
| Postgres | 16 (via Docker) |
| Redis | 7 (via Docker) |

---

## 2. Clone & Install

```bash
git clone https://github.com/<your-org>/tatacliq-seller-dashboard.git
cd tatacliq-seller-dashboard

# Root install (workspaces)
npm install

# Python deps (only needed for Phase 2/3 work)
cd workers/python
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

---

## 3. Environment variables

Copy the example files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Fill in:

| Key | Where to get it |
|-----|----------------|
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Web app). |
| `GMAIL_REDIRECT_URI` | `http://localhost:3000/api/auth/gmail/callback` for dev. |
| `GMAIL_MONITORED_ACCOUNT` | `zaynah15mahmood@gmail.com` |
| `SELLER_TEST_EMAIL` | `liyana2015za@gmail.com` |
| `GEMINI_API_KEY` | Google AI Studio → API keys (use the key from `zaynah15mahmood@gmail.com`). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` | AWS IAM user with S3 access. |

---

## 4. Google Cloud Console — Gmail API setup

1. Create a project (or reuse one).
2. Enable **Gmail API** under APIs & Services → Library.
3. Configure OAuth consent screen (Internal or External + add `zaynah15mahmood@gmail.com` as a test user).
4. Create OAuth 2.0 credentials (Web application).
   - Authorized redirect URI: `http://localhost:3000/api/auth/gmail/callback`
5. Copy client ID + secret into `.env`.
6. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`

---

## 5. Google AI Studio — Gemini API key

1. Sign in to [https://aistudio.google.com/](https://aistudio.google.com/) with `zaynah15mahmood@gmail.com`.
2. Click **Get API key** → **Create API key**.
3. Paste into `GEMINI_API_KEY` in both root `.env` and `workers/python/.env` if you create one.

---

## 6. Start infra

```bash
docker compose up -d
```

Brings up Postgres on `:5432` and Redis on `:6379`.

---

## 7. Database

```bash
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
cd ../..

# Optional: seed with mock data
npm run seed
```

---

## 8. Run the apps

In separate terminals:

```bash
# Frontend
cd apps/web && npm run dev
# -> http://localhost:3000

# Backend (Phase 2+)
cd apps/api && npm run dev
# -> http://localhost:4000

# Python enrichment worker (Phase 2+)
cd workers/python
uvicorn enrichment.main:app --reload --port 8000

# Python image worker (Phase 3+)
uvicorn image_processing.main:app --reload --port 8001
```

Phase 1 only requires the frontend — the rest is needed once you start ingesting real Gmail data.

---

## 9. First sync

1. Open `http://localhost:3000/settings`
2. Click **Connect Gmail** (Phase 2 button) and complete the OAuth flow.
3. Click **Sync now** — emails from `liyana2015za@gmail.com` will populate the Inbox.

---

## 10. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find module '@prisma/client'` | Run `npx prisma generate` inside `apps/api`. |
| Gmail OAuth `redirect_uri_mismatch` | Make sure the URI in `.env` matches Google Console exactly (including trailing slash). |
| Gemini `403 PERMISSION_DENIED` | The API key isn't on a project with Generative Language API enabled. |
| Outpaint worker OOM | SDXL needs ~12 GB VRAM. Use a smaller pipeline (SD 1.5 inpaint) for dev. |
