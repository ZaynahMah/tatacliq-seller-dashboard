# ⚡ Quick Start

MDD-driven catalog enrichment + AI image studio. Two pipelines, ready for GitHub + Vercel.

| Pipeline | Page | Purpose |
|----------|------|---------|
| **AI Image Studio** | `/studio` | Resize images to 1080×1440 with Pure White, Pure Black, or AI-extended backgrounds |
| **Catalog Enrichment v2** | `/upload` | Upload seller Excel (or ZIP) → download MDD-compliant per-L4 enriched workbook |

---

## 🚀 Run it locally (3 commands)

```bash
unzip tatacliq-seller-dashboard.zip
cd tatacliq-seller-dashboard/apps/web
npm install
npm run dev
```

Open http://localhost:3000.

---

## 📦 Sample files included

| File | What it tests |
|------|---------------|
| **`sample-outzidr-catalog.csv`** | **NEW** — 12 rows matching the real Outzidr seller-file format (3 styles × 4 sizes) for testing the MDD pipeline |
| `sample-catalog-with-images.zip` | 5 products × 6 images each, CSV with image refs (`1_SKU.jpg` naming) — drop into `/upload` |
| `sample-catalog-missing-data.csv` | 10 Myntra/Ajio-style products with ~20 fields blank — for text-only enrichment testing |
| `sample-catalog.xlsx` | 8-product simpler catalog |

---

## 🧠 What the new MDD pipeline does

For every uploaded seller row:

1. **Classify** to L1 > L2 > L3 > L4 category (e.g., "Casual Dress" → Apparel > Women's Apparel > Western Wear > Casual dresses)
2. **Group** SKUs into style families by Style Code; assign Lead Variant
3. **Normalize** seller values to the exact LOV the Tata CLiQ portal accepts (`"Regular fit"` → `"Regular Fit"`, `"Casual Wear"` → `"Daily"`)
4. **Infer** missing fields (dress shape, dress length, t-shirt type, brand, gender) from text
5. **Generate** Title, Description, MiniDescription, MetaTitle, MetaKeyword, MetaDescription, Tags, Story Name — all following Catalogus.ai patterns
6. **Validate** against MDD: any mandatory field still empty is flagged in the `_Compliance` sheet
7. **Emit** one sheet per L4 category with the exact column set MDD requires for that category (matching Catalogus.ai's output layout exactly)

The downloaded XLSX has:
- One sheet per L4 (e.g., `Casual Dresses`, `Tops And Tees`, `Casual Shirts`) — different column sets per category
- `_QA` sheet showing per-row classification confidence, overall confidence, missing fields, lead variant
- `_Compliance` sheet listing only rows that need review

Full docs in `docs/MDD-PIPELINE.md`.

---

## 🎨 Try the AI Image Studio

1. Go to `/studio`
2. Drop any product photo (JPG/PNG/WebP)
3. Pick a **Background mode**:
   - **Pure White** (#FFFFFF) — marketplace cutout look
   - **Pure Black** (#000000) — editorial cutout
   - **White Studio** — soft white gradient
   - **Marketplace Portrait** — warm neutral Myntra-style
   - **Smart Fit** — extend existing background naturally
   - **Extend Background** — show more of the environment
4. Pick dimensions — defaults to **1080×1440**
5. Click **Enhance**. Get before/after, crop-risk scores, regenerate, download.

**Guarantees**: head/hands/feet/garment never cropped, no blur, no stretching, no white padding boxes (unless you explicitly pick Pure White).

---

## 📊 Try MDD Catalog Enrichment

1. Go to `/upload`
2. Drop `sample-outzidr-catalog.csv` (or your own seller file)
3. Click **Run AI Enrichment**
4. See per-product preview: classification (L1>L2>L3>L4), confidence per field, source per field, missing mandatory fields
5. Click **Download .xlsx** — get per-category sheets + QA + Compliance

**Image-to-product mapping** (for ZIP uploads): filenames like `1_NYK-KRT-2241.jpg` are linked to the CSV row where the SKU is `NYK-KRT-2241`. Multiple images per product (1-8) are auto-grouped and sorted.

---

## 💰 See live cost tracking

Go to `/usage` — shows tokens used, cost per product, cost per sheet, monthly projection, Gemini-vs-fallback %, and a scale calculator with sliders.

---

## 🔑 Add Gemini API key (optional)

Without it: rules-based MDD engine works for both pipelines.
With it: real Gemini for text polish + Nano Banana for images.

1. Get a key: https://aistudio.google.com → **Get API key**
2. Create `apps/web/.env.local`:
   ```
   GEMINI_API_KEY=paste_your_key_here
   ```
3. Restart `npm run dev`

---

## 🚢 Deploy to GitHub + Vercel

See `DEPLOY.md`. Short version:

```bash
# Push to GitHub
git init && git add . && git commit -m "MDD pipeline v2"
git branch -M main
git remote add origin https://github.com/ZaynahMah/tatacliq-seller-dashboard.git
git push -u origin main

# Deploy on Vercel
# 1. vercel.com → Import → pick this repo
# 2. Root Directory: apps/web
# 3. Click Deploy
```

CI is set to type-check only `apps/web` so backend scaffolding won't block deploys.

---

## 💸 Per-product cost (5-8 images each)

| Component | Cost per product |
|---|---|
| 6 image enhancements (Gemini 2.5 Flash Image) | $0.234 / ₹19.50 |
| MDD enrichment (rules-based, no API calls) | $0 |
| Optional Gemini text polish per style family lead | $0.0017 / ₹0.14 |
| **Total per product** | **~$0.234 / ₹19.50** |

The MDD engine runs entirely without Gemini for text enrichment — every field can be normalized and generated from rules. Gemini is only needed for image enhancement and optional copy polish.

Full economics: see `docs/SCALING-ECONOMICS.md`.
