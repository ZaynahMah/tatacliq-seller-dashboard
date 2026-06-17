# Vision Layer (v3)

The Vision layer adds Gemini 2.5 Flash image inference to the MDD enrichment pipeline. When enabled, the system downloads product images directly from URLs in the seller spreadsheet, sends them to Gemini with a JSON-schema-constrained prompt, validates every extracted value against the LOV, and merges with seller text using per-attribute trust rules.

## How it differs from v2 (text-only)

| Field | v2 (text only) | v3 (with Vision) |
|---|---|---|
| `color_family` | normalized from seller's color text | extracted from image; image wins on disagreement |
| `pattern` | normalized from seller's pattern text | extracted from image (solid/floral/striped/etc.) |
| `neck_collar` | normalized from seller's text or defaulted to "Round Neck" | identified from image |
| `sleeve` | normalized from seller's text | identified from image |
| `dress_shape` | inferred from title keywords | identified from silhouette in image |
| `dress_length` | inferred from title keywords or seller value | measured from image |
| `tshirt_type` | inferred from title keywords | identified from image |
| `fabric_family` | normalized from seller's text | seller wins (image is unreliable for fabric) |
| `description` | template + seller hook | template + seller hook + Vision's visual description fed into the design sentence |

## How to enable

1. **Get a Gemini API key:** https://aistudio.google.com → "Get API key"
2. **Set it in Vercel:**
   - Project Settings → Environment Variables
   - Add `GEMINI_API_KEY` = your key
   - Apply to Production, Preview, Development
   - Redeploy
3. **In the dashboard:** open `/upload`, the "Use image inference (Gemini Vision)" toggle is on by default. Upload a file and Vision runs automatically.

If you don't set the API key, the toggle silently falls back to text-only enrichment — no errors, no broken uploads. The UI will show "GEMINI_API_KEY not set — Vision skipped".

## Cost model

| | Per call | Per 1000 SKUs (assume 250 style families) |
|---|---|---|
| Gemini 2.5 Flash with 2 images + JSON output | ~$0.001 | ~$0.25 |

The pipeline calls Vision **once per style family lead**, not per variant SKU. A typical apparel catalog has 3-5 size variants per style, so this gives a ~4× cost reduction vs naive per-row calls.

## Architecture

```
seller XLSX
    │
    ▼
[Phase 1] parseExcelBuffer (multi-row header detection)
    │
    ▼
[Phase 2] getStyleFamilyLeads (one lead per style family)
    │
    ▼
[Phase 3] analyzeLeads — for each lead:
          ├── download images (timeout=8s, max=5MB)
          ├── send to Gemini 2.5 Flash with responseSchema
          ├── LOV-validate every enum field
          └── store as VisionAttrs map keyed by lead SKU
    │
    ▼
[Phase 4] enrichCatalog (now with opts.visionAttrs)
          For each row, in the engine:
          ├── derive attrs from seller text (as before)
          ├── look up Vision attrs for the row's lead SKU
          └── merge per attribute via TRUST_RULES:
              ├── image wins for color/pattern/neckline/sleeve/shape/length
              ├── seller wins for fabric/MRP/HSN/manufacturer/etc.
              └── log conflict when both have values that disagree
    │
    ▼
[Phase 5] buildEnrichmentWorkbook
          (one sheet per L4 + _QA sheet showing source/confidence/conflicts
           + _Compliance sheet listing missing mandatory fields)
    │
    ▼
output XLSX
```

## Per-attribute trust rules

Defined in `lib/vision-enrichment.ts` as `TRUST_RULES`:

```typescript
{
  // Image wins (the photo is more reliable than seller text)
  color_family: 'image',
  pattern: 'image',
  neck_collar: 'image',
  sleeve: 'image',
  sleeve_styling: 'image',
  dress_shape: 'image',
  dress_length: 'image',
  tshirt_type: 'image',

  // Seller wins (the seller knows their product better than an image can show)
  fabric_family: 'seller',
  fabric: 'seller',
  hsn_code: 'seller',
  manufacturers_details: 'seller',
  importers_details: 'seller',
  packers_details: 'seller',
  country_of_origin: 'seller',
  mrp: 'seller',
  size: 'seller',
  brand: 'seller',
  brand_description: 'seller',
}
```

When seller and Vision agree: confidence boosted by 0.1 (capped at 1.0).
When seller and Vision disagree: trust rule applied + conflict logged for review in `_QA` sheet.

## LOV validation

Two layers:

1. **In the prompt:** The Gemini API call uses `responseSchema` with `enum` constraints on every LOV-bounded field. The schema forces the model to pick from the allowed list or return `UNKNOWN`.

2. **In post-processing:** Even with schema, we run `validateEnumValue()` on every returned value as a backstop. Values that somehow slip through (case-insensitive matches, model edge cases) get normalized to the canonical LOV form, and outright invalid values get dropped (treated as "UNKNOWN").

This double-validation means **no arbitrary text ever lands in your output XLSX for an LOV-constrained field**.

## Confidence calibration

Vision confidence per attribute is computed as `overall × per-field-reliability`:

| Attribute | Reliability multiplier | Rationale |
|---|---|---|
| `color_family` | 0.95 | Color is the most reliable visual signal |
| `sleeve` | 0.92 | Sleeve type is clearly visible |
| `pattern` | 0.9 | Pattern is clearly visible |
| `neck_collar` | 0.9 | Clear for front-facing shots |
| `dress_shape` | 0.88 | Mostly reliable |
| `dress_length` | 0.88 | Mostly reliable |
| `sleeve_styling` | 0.85 | Details can be ambiguous |
| `tshirt_type` | 0.85 | Some types are hard to distinguish |
| `fabric_visual_hint` | 0.55 | **Capped low** — fabric is hard to determine from photos alone |

## How to verify Vision is actually running

Three layers of verification:

**1. Browser DevTools → Network tab** during upload:
- You should see `POST /api/enrich-preview-v3` and `POST /api/enrich-batch-v3`
- The response JSON will contain a `vision` block showing `attempted: true`, `stats.leadsSucceeded`, `stats.estimatedCostUsd`, etc.

**2. The dashboard UI** after upload:
- Vision stats panel appears with: leads analyzed, rows enriched, conflicts flagged, failures, cost
- Sample extractions for the first 3 leads show the actual extracted color/pattern/neck/sleeve/shape/length plus the model's visual description
- Row badges show "vision" tag and conflict counts where applicable

**3. `/usage` page:**
- Catalog-enrich events show `engine: gemini` (not `rules`) when Vision was used
- Cost field reflects the Vision call cost

## Failure modes and graceful degradation

| Scenario | Behavior |
|---|---|
| `GEMINI_API_KEY` not set | Vision skipped entirely; UI shows warning; output is text-only enriched |
| Image URL returns 404 | That style family's vision call fails; falls back to text-only for those rows; logged in failures list |
| Image is too large (>5MB) | Same as 404 — skipped, logged |
| Image download timeout (8s) | Same as 404 — skipped, logged |
| Gemini returns malformed JSON | Vision attrs not applied for that style family; text-only fallback for those rows |
| Vision call rate limited | Caller retry not implemented yet; failure logged |

**One bad image never breaks the whole upload.** Each style family is handled independently. If 10 out of 250 leads fail, you still get 240 vision-enriched plus 10 text-only enriched.

## Cost guards

- `DEFAULT_MAX_LEADS = 300` — hard cap on Vision calls per upload
- `MAX_IMAGES_PER_CALL = 2` — first 2 images per lead are enough
- Sequential processing (no parallel API calls yet) — slower but cheaper if you want to abort mid-run
- All costs estimated upfront and shown in the UI before download

## What's next (Phase 4 candidates)

- **Conflict-resolution UI** — let operators decide per-conflict whether to keep seller's or Vision's value
- **Parallel Vision calls** — `p-limit(5)` for ~5× faster batch processing
- **More LOV fields** — embroidery type, border type, print style as their own LOV-validated fields
- **Image-quality scoring** — flag low-resolution or non-product-shot images before sending to Vision
- **Web search fallback** — when seller's brand description is missing, look up the brand's official site (off by default for legal reasons)
