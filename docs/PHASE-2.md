# Phase 2 — Gemini Enrichment Engine

## Goals

- Parse Excel/CSV seller attachments into structured `Product` rows.
- For every product, identify missing fields among the mandatory list.
- Call Gemini Pro (text + vision) to fill missing fields with confidence scores.
- Store results as `AISuggestion` rows for human review.
- Build the editable review UI on the Enrichment screen.
- Validation engine: HSN format, EAN-13 checksum, SKU uniqueness per seller, MRP range sanity, image count.
- Master sheet generation: portal-ready XLSX per seller.

## Deliverables

| File | Purpose |
|------|---------|
| `apps/api/src/workers/parse.worker.ts` | BullMQ worker that reads Excel/CSV from S3, normalizes columns, inserts products. |
| `apps/api/src/workers/enrich.worker.ts` | Calls Python enrichment service, persists suggestions. |
| `apps/api/src/workers/validate.worker.ts` | Runs validation rules, creates `ValidationIssue` rows. |
| `apps/api/src/workers/sheet.worker.ts` | Generates portal-ready XLSX using `exceljs`. |
| `workers/python/enrichment/main.py` | Already scaffolded — extend with real Gemini calls. |
| `apps/web/app/enrichment/[productId]/page.tsx` | Dynamic route for single-product review. |

## Mandatory fields

```
product_type, hsn_code, sku, title, seo_keywords, description, fabric_family,
sleeve_type, age_band, brand_description, fit_type, features, wash_care,
neck_collar, occasion, pattern, color_family, mrp, fabric_composition,
size_chart, country_of_origin, manufacturer, ean, seller_id, cuff_style,
hemline, transparency, branding_logo, pocket_type, neckline, stitching
```

## Gemini prompt design

System prompt is in `workers/python/enrichment/gemini_client.py`. Key constraints:

- JSON-only output (no markdown).
- Per-field confidence 0..1.
- Source must be one of `gemini_text`, `gemini_vision`, `cross_ref`.
- Indian compliance fields (HSN, EAN, country_of_origin, manufacturer) below 0.6 confidence are flagged for manual review.
- Never reference Tata CLiQ.

## Validation rules

| Field | Rule |
|-------|------|
| `hsn_code` | 4, 6, or 8 digits. Numeric only. |
| `ean` | 13 digits, valid checksum. |
| `sku` | unique per seller. |
| `mrp` | 99 ≤ value ≤ 99,999. |
| `image_count` | ≥ 3 per product. |
| `title` | ≤ 80 chars, no all-caps, no emoji. |
| `description` | 40-400 chars, no Tata CLiQ mentions. |

## API additions

| Route | Method | Purpose |
|-------|--------|---------|
| `/products/:id/enrich` | POST | Enqueue Gemini job. |
| `/products/:id/suggestions/:sid/accept` | POST | Promote suggestion to authoritative attribute. |
| `/products/:id/suggestions/:sid/edit` | POST | Edit value before accepting. |
| `/products/:id/suggestions/:sid/reject` | POST | Mark rejected (won't be re-asked). |
| `/sheets/generate` | POST | Generate master sheet for a seller. |

## Success metrics

- ≥ 85% of mandatory fields auto-filled.
- ≥ 90% of HSN/EAN suggestions accepted by ops without edit.
- Average review time per product < 30 seconds.
