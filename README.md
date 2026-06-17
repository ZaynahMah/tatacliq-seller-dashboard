# TataCLiQ Seller Dashboard

> AI-powered Seller Data Enrichment Dashboard for fashion e-commerce operations.
> Automatically parses seller emails, enriches catalog data with Gemini Pro, fixes fashion images with AI outpainting, and generates production-ready master sheets.

![Status](https://img.shields.io/badge/status-Phase%201-blue) ![Stack](https://img.shields.io/badge/stack-Next.js%20%7C%20Node%20%7C%20Python%20%7C%20Postgres-pink) ![License](https://img.shields.io/badge/license-Internal-lightgrey)

## What this is

An internal operations dashboard for ~20 ops employees who today receive messy Excel sheets + fashion product images from sellers over email, manually fix them, and forward them to external enrichment agencies. This tool replaces that pipeline with an AI-first workflow:

1. **Gmail integration** pulls seller emails (`liyana2015za@gmail.com` → internal account).
2. **Email parser** extracts attachments (XLSX, CSV, ZIP, images).
3. **Gemini Pro** (account: `zaynah15mahmood@gmail.com`) enriches missing attributes — HSN, SKU, fabric, sleeve type, occasion, neckline, wash care, etc.
4. **AI image worker** outpaints 1200×1200 product photos to 1080×1440 without cropping heads, hands, or garments.
5. **Validation engine** flags duplicates, bad EANs, invalid HSN codes.
6. **Master sheet generator** outputs a portal-ready XLSX.
7. **Auto-replier** emails sellers back for missing fields and re-ingests their replies.

## Tech stack

| Layer            | Choice                                     |
| ---------------- | ------------------------------------------ |
| Frontend         | Next.js 14 (App Router), TypeScript        |
| UI               | TailwindCSS + ShadCN-style components      |
| Motion           | Framer Motion                              |
| Charts           | Recharts                                   |
| Backend API      | Node.js (Express/Fastify), TypeScript      |
| AI workers       | Python (FastAPI), Pandas, OpenPyXL, OpenCV |
| AI model         | Gemini Pro (text + vision)                 |
| Image outpaint   | Diffusers (Stable Diffusion XL Inpaint)    |
| Database         | PostgreSQL (Prisma ORM)                    |
| Queue            | Redis + BullMQ                             |
| Storage          | AWS S3 (or Cloudinary)                     |
| Email            | Gmail API (OAuth2)                         |
| Deployment       | Docker Compose → AWS ECS / Vercel + Fly.io |

## Build phases

This is structured into 4 phases. Each phase is a vertical slice that ships something usable.

### ✅ Phase 1 — Foundation (this commit)
- Monorepo scaffolding
- Full UI shell with all 9 screens (Dashboard, Inbox, Queue, Enrichment, Image Studio, Validation, Communications, Master Sheets, Analytics, Settings)
- Mocked seller data so the UI runs end-to-end immediately
- Gmail OAuth scaffolding + IMAP fallback
- Attachment upload flow + S3 client
- Database schema (Prisma)
- Express API skeleton with route stubs
- Docker Compose for Postgres + Redis

### ⏳ Phase 2 — Gemini Enrichment Engine
- Python worker calling Gemini Pro
- Attribute extraction from titles, descriptions, images
- Cross-source enrichment (Myntra, Ajio, Amazon Fashion — never Tata CLiQ)
- Confidence scoring
- Validation engine (HSN/EAN/SKU rules)
- Master sheet generator (`openpyxl`)
- Missing-field detection

### ⏳ Phase 3 — AI Image Studio
- SDXL inpaint outpainting worker (1200×1200 → 1080×1440)
- Fashion-aware person/garment detection (preserve subject)
- Batch processing
- Side-by-side preview UI

### ⏳ Phase 4 — Automation & Production
- Seller communications (auto-reply, missing-field requests)
- Reply re-ingestion
- BullMQ workers with retries
- Analytics dashboard (real metrics)
- Seller quality scoring
- Docker production builds + CI

## Quick start

```bash
git clone <this-repo>
cd tatacliq-seller-dashboard

# Install
npm install

# Bring up Postgres + Redis
docker compose up -d

# Run the web app
cd apps/web && npm run dev
# → http://localhost:3000

# (Phase 2+) Run API and Python workers
cd apps/api && npm run dev
cd workers/python && uvicorn enrichment.main:app --reload
```

See **[docs/SETUP.md](docs/SETUP.md)** for environment variables, Gmail OAuth setup, and Gemini API key configuration.

## Repository layout

```
tatacliq-seller-dashboard/
├── apps/
│   ├── web/          # Next.js dashboard (Phase 1)
│   └── api/          # Node.js API + queue producer (Phase 2)
├── workers/
│   └── python/       # Gemini + image AI workers (Phase 2/3)
├── packages/
│   ├── shared/       # Shared TS types
│   └── ui/           # Shared UI primitives
├── docs/
│   ├── SETUP.md
│   ├── ARCHITECTURE.md
│   ├── PHASE-2.md
│   ├── PHASE-3.md
│   └── PHASE-4.md
├── scripts/
└── docker-compose.yml
```

## License

Internal use. Not for redistribution.
