# MDD-Driven Enrichment Pipeline (v2)

The catalog enrichment system was rebuilt around the **Master Data Dictionary (MDD)** to produce output that matches the quality and structure of Catalogus.ai's reference files.

## What changed

| Aspect | Before | After |
|---|---|---|
| Output schema | Single 30-column "enriched.xlsx" | **One sheet per L4 category**, dynamic column set per category (~80-85 cols, matching MDD) |
| Category mapping | Flat product_type string | **L1 > L2 > L3 > L4** classification with confidence score |
| Value normalization | Loose substring | **MDD LOV** lookup + seller→MDD dictionary |
| Style variants | Each row standalone | **Style families** detected via Style Code; Lead Variant ID assigned |
| Validation | None | **Per-row mandatory field check** against MDD; compliance sheet |
| Field provenance | None | Every enriched field has **source** (seller/normalized/inferred/generated) and **confidence** (0-1) |
| Copy generation | Single description | **Title, Description, MiniDescription, MetaTitle, MetaKeyword, MetaDescription, Tags, Story Name** — all following Catalogus.ai patterns |

## Architecture

```
apps/web/lib/
├── mdd.ts                   # MDD source of truth: categories, LOV, SELLER_TO_MDD map, classifier
├── copy-templates.ts        # Catalogus-style title/description/meta generators
├── enrichment-engine.ts     # Multi-pass pipeline orchestrator
├── output-builder.ts        # Per-category XLSX schema → workbook builder
└── excel.ts                 # Seller-side parser (unchanged)
```

## Pipeline phases

1. **Parse** — XLSX/CSV/ZIP → `ParsedProduct[]`. Loose key matching ignores `(Refer LOV List)` suffixes and whitespace.
2. **Classify** — Each row → L4 category via product-type synonyms, title keywords, HSN code. Records confidence + reason.
3. **Group** — SKUs with the same Style Code (or derived prefix) become a style family. Smallest SKU = lead variant.
4. **Normalize** — Every enum-valued field passes through `SELLER_TO_MDD` (e.g., `"Regular fit"` → `"Regular Fit"`, `"Casual Wear"` → `"Daily"`). LOV match = 1.0, dictionary match = 0.85, substring match = 0.6.
5. **Infer** — Missing fields filled from text/title (dress shape, dress length, t-shirt type) with confidence scores.
6. **Generate** — Title/Description/Mini/Meta×3/Tags/Story Name composed from canonical fields using Catalogus.ai's observed patterns.
7. **Validate** — Each row checked against its L4's mandatory attribute list. Lead-only fields (images, brand description, manufacturer details) excluded from variant validation.
8. **Emit** — One sheet per L4 category, schema rows matching Catalogus.ai's exact layout: type / mandatory flag / max length / display name / attr code, then data.

## Output structure

The downloaded XLSX contains:

- **One sheet per L4 category** (e.g., `Casual Dresses`, `Tops And Tees`, `Casual Shirts`). Columns differ between sheets because each L4 has a different set of MDD mandatory attributes — exactly as Catalogus.ai does it.
- **`_QA` sheet** — SKU, category, classification confidence + reason, overall confidence, missing fields, lead variant link, family size. For ops to triage low-confidence rows quickly.
- **`_Compliance` sheet** — Only rows that have missing mandatory fields. Each row lists which MDD attributes are still empty, so the seller knows exactly what to fix.

## Header rows (matching Catalogus.ai exactly)

```
Row 0: data type      String  | String       | INTEGER  | ENUM ...
Row 1: mandatory      MAND.   | MAND.        | MAND.    | NON-M ...
Row 2: max length     1       | 15           | 30       | 100  ...
Row 3: display name   S_OR_D  | HSN CODE     | SKU      | TITLE ...
Row 4: PIM attr code  PRODUCTUPLOADSTATUS* | HSNCODE* | SKUCODE* ...
Row 5+: data          S       | 61091000     | WMNA...  | Outzidr ...
```

## API endpoints

- `POST /api/enrich-preview-v2` — Returns JSON summary for the first 30 rows: per-product highlights, confidence per field, source per field, classification reason, missing mandatory list.
- `POST /api/enrich-batch-v2` — Returns the full MDD-compliant XLSX (up to 200 rows). Response headers include processed count, average confidence, style family count, rows-needing-review count.

Both accept `excel` (XLSX/CSV) or `zip` (containing one) as multipart form data.

## Adding a new L4 category

1. In `lib/mdd.ts` `CATEGORIES`, add a `CategoryNode` with: L1/L2/L3/L4 names, display name, HSN prefixes, seller synonyms, mandatory attribute keys, optional attribute keys.
2. If the category needs a different column set (e.g., trousers need `Waist Rise`, `Trouser Type`), add a `*_SPECIFIC` array in `output-builder.ts` and wire it into `getSchemaForCategory`.
3. If the category needs special title or description shape, add a case in `copy-templates.ts` `inferTitleNoun`.

## Adding a new value to a LOV

In `lib/mdd.ts`, append the canonical value to the relevant `LOV` array. If sellers use different phrasings, add lowercase entries to `SELLER_TO_MDD[attr]` mapping each phrasing to the canonical value.

## Confidence scoring legend

| Score | Meaning | Color in UI |
|---|---|---|
| 1.0 | Field came from seller exactly matching MDD LOV | green |
| 0.85 | Mapped via `SELLER_TO_MDD` dictionary | green |
| 0.7 | Inferred from text/title with strong signal | amber |
| 0.6 | Substring match against LOV | amber |
| 0.4 | Inferred from text with weak signal | red |
| 0 | Could not determine — passed through raw or default | red |

## Field sources

- `seller` — Value came directly from the seller's file
- `normalized` — Mapped via SELLER_TO_MDD (e.g., "Regular fit" → "Regular Fit")
- `inferred` — Derived from text analysis (e.g., dress_length from title keywords)
- `generated` — AI-generated copy (title, description, meta fields)
- `image` — Reserved for image-based inference (Gemini Vision; Phase 2)

## What's still on the roadmap

1. **Image-based attribute refinement** — Catalogus.ai upgrades fields like `Neck/Collar` ("Round neck" → "V-Neck") by *looking at images*. The hook is in place (`opts.imageInferenceAvailable`); the actual Vision pass is Phase 2.
2. **Gemini-augmented copywriting** — One Gemini text call per *style family lead* (not per variant) would polish the description further. Cost: ~$0.0017 per family.
3. **More L4 categories** — Currently 7 categories are wired in (Casual Dresses, Tops & Tees, Casual Shirts, Jeans, Skirts, Kurta & Kurtis, Sarees). Add the rest as needed.

## Backward compatibility

The original `/api/enrich-batch` and `/api/enrich-preview` routes still work — they use the legacy single-sheet engine. The Upload page now points to the v2 routes. To switch back temporarily, change the two `fetch('/api/enrich-...-v2', ...)` calls in `app/upload/page.tsx`.
