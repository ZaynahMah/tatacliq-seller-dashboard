# Scaling Economics

Cost reference for the AI image + catalog enrichment pipelines. All numbers verified against Google AI for Developers pricing, May 2026.

## Per-unit costs (Gemini, paid tier)

| Unit | Tokens | Cost (USD) | Cost (INR @ ₹83.5) |
|------|--------|------------|---------------------|
| One enhanced image (≤1024 px) | ~2,580 (1,290 in + 1,290 out) | **$0.039** | ~₹3.26 |
| One product field-enrichment | ~800 (200 in + 600 out) | **$0.0017** | ~₹0.14 |
| One 50-SKU master sheet | ~40,000 | **$0.085** | ~₹7.10 |
| One 100-SKU master sheet | ~80,000 | **$0.17** | ~₹14.20 |

> Image pricing source: `Gemini 2.5 Flash Image` — output tokens at $30/M, 1,290 tokens per output image. Text pricing source: `Gemini 2.5 Flash` — $0.30/M input, $2.50/M output.

## Monthly scenarios

| Scenario | Products / mo | Images / mo | Gemini % | Monthly cost |
|----------|---------------|-------------|----------|--------------|
| **Small ops team** | 2,000 | 6,000 | 100% | ~$237 / ₹19,800 |
| **Mid-volume team** | 5,000 | 15,000 | 100% | ~$594 / ₹49,600 |
| **Hybrid routing** (80% Gemini) | 5,000 | 15,000 | 80% | ~$475 / ₹39,700 |
| **Hybrid routing** (50% Gemini) | 5,000 | 15,000 | 50% | ~$297 / ₹24,800 |
| **Fallback-only** | 5,000 | 15,000 | 0% | **$0** (free) |
| **Enterprise** | 50,000 | 150,000 | 100% | ~$5,935 / ₹495,500 |

## Cost levers

1. **Hybrid routing** — Route only low-confidence items to Gemini, send the rest through the deterministic fallback. The fallback is free and good enough for ~70-80% of standard fashion items (clear category, standard fabric, normal posing).

2. **Batch API discount** — Google's Batch API gives a 50% discount on Gemini text models for non-real-time work. Catalog enrichment fits this well — sellers send a sheet, you return enriched data within 24h. Cuts catalog costs in half.

3. **Image input optimization** — Resize seller images to ≤1024 px before sending. The 1,290-token cap applies up to 1024×1024; above that, costs scale with resolution. Most seller photos are 2048+ px, so this is an easy 2× saving on input.

4. **Caching** — Brand-level prompts (size charts, common descriptions, brand voice) can be cached at 10% of base input cost. Useful when processing multiple sheets from the same seller.

## Where the dashboard fits in

The `/usage` page reads live event data from the in-memory tracker:

- **Total cost** for the current session (USD + INR)
- **Tokens used** across all API calls
- **Gemini vs Fallback %** routing mix
- **30-day projection** scaled from current usage rate
- **Per-image, per-product, per-sheet** averaged costs
- **Scale calculator** — sliders for monthly volume + Gemini % → projects monthly spend
- **Mode breakdown** — which image enhancement modes are used most

In production, the in-memory tracker would be backed by Postgres with daily aggregation tables. The shape of the data and the UI stay the same.

## What "free" means in the fallback path

The sharp-based fallback engine has zero API costs but still does real work:

- **Image enhancement**: edge-extension canvas + native-resolution subject compositing. Subject pixels are pasted unchanged — no blur, no re-encoding chain. For studio-shot inputs (uniform backgrounds), output is visually indistinguishable from a generative outpaint.
- **Catalog enrichment**: deterministic keyword-based field filling using a curated lookup of category → HSN, fabric, fit, etc. Confidence scores 75-90% on standard items.

Server cost for the fallback path is just the Next.js compute time on whatever host you deploy to — Vercel free tier, Render starter, or self-hosted on a $5/month VPS all handle this comfortably for <10k ops/month.
