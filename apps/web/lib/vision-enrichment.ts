/**
 * Vision-based product enrichment.
 *
 * Reads images from the seller's image URLs (one Gemini call per style-family
 * LEAD SKU — not per variant, since same-style variants share images), extracts
 * structured attributes constrained to the MDD LOV, and merges those with the
 * seller's text-provided values using per-attribute trust rules.
 *
 * Key design decisions:
 *
 *  1. Style-family scoping — All variants in a family share images, so we only
 *     call Vision once per lead. Saves ~75-90% of API spend on typical catalogs
 *     where each style has 4-6 size variants.
 *
 *  2. JSON schema constraint — Use Gemini's `responseSchema` field so the model
 *     is forced to return well-formed JSON. We still LOV-validate every value
 *     in post-processing as a backstop.
 *
 *  3. Per-attribute trust rules — Image wins for visual fields (color, pattern,
 *     neckline, dress shape, dress length, sleeve). Seller wins for fields the
 *     image cannot reliably show (fabric composition, manufacturer/importer/
 *     packer details, HSN, country of origin, MRP, SKU). When they disagree on
 *     image-trustworthy fields, we use the image but flag the conflict in _QA.
 *
 *  4. Cost guards — Hard cap on Vision calls per upload (default 300 leads),
 *     timeout per download (8s), retry once on transient errors. Skips entirely
 *     when GEMINI_API_KEY is not set.
 *
 *  5. Graceful degradation — If Vision fails for a specific lead (image 404,
 *     timeout, schema violation), that row falls back to text-only enrichment
 *     and the failure is recorded. One bad image never breaks the whole upload.
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type { ParsedProduct } from './excel';
import { LOV } from './mdd';
import { trackUsage } from './usage-tracker';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The structured attributes extracted from product images.
 * Every enum field is LOV-validated; anything else is kept as free text
 * for use in description generation only.
 */
export interface VisionAttrs {
  /** Lead SKU these attrs belong to (all variants in the family inherit them) */
  leadSku: string;

  // ─── LOV-constrained fields ──────────────────────────────────────────
  color_family?: string;        // LOV.color_family
  pattern?: string;             // LOV.pattern
  fabric_visual_hint?: string;  // LOV.fabric_family — LOW confidence by default
  neck_collar?: string;         // LOV.neck_collar
  sleeve?: string;              // LOV.sleeve
  sleeve_styling?: string;      // LOV.sleeve_styling
  fit?: string;                 // LOV.fit — silhouette/fit (slim, regular, flared, etc.)
  dress_shape?: string;         // LOV.dress_shape (dresses only)
  dress_length?: string;        // LOV.dress_length (dresses only)
  tshirt_type?: string;         // LOV.tshirt_type (tops only)

  // ─── Free-form descriptive fields ────────────────────────────────────
  /** Specific color name the model saw (e.g., "blush pink" — for description use only) */
  color_specific?: string;
  /** What design embellishments are visible (e.g., "lace trim at hem, satin tie at waist") */
  design_details?: string;
  /** Pattern detail when applicable (e.g., "small ditsy floral print scattered across base") */
  pattern_detail?: string;
  /** One-sentence visual description for use in product description generation */
  visual_description?: string;

  // ─── Booleans for design flags ───────────────────────────────────────
  has_embroidery?: boolean;
  has_print?: boolean;
  has_border?: boolean;
  has_lace?: boolean;
  has_sequins?: boolean;

  // ─── Per-attribute confidence (0-1) ──────────────────────────────────
  confidence: Record<string, number>;

  // ─── Provenance metadata ─────────────────────────────────────────────
  /** Number of images successfully analyzed */
  imagesAnalyzed: number;
  /** Raw model response (for debugging in _QA sheet) */
  rawResponse?: string;
  /** Error message if the call failed entirely */
  error?: string;

  // ─── Real token usage for this row's Vision call (from Gemini's own
  // usageMetadata — not estimated) so cost-per-row can be reported exactly. ──
  tokensIn?: number;
  tokensOut?: number;
  /** Computed from real tokensIn/tokensOut at current Gemini 2.5 Flash pricing */
  costUsd?: number;
}

/**
 * Stats returned to the API caller so the UI can show what Vision did.
 */
export interface VisionRunStats {
  leadsAttempted: number;
  leadsSucceeded: number;
  leadsFailed: number;
  totalImagesDownloaded: number;
  totalApiCalls: number;
  estimatedCostUsd: number;
  /** Real totals from Gemini's usageMetadata, summed across every Vision call this run. */
  totalTokensIn: number;
  totalTokensOut: number;
  /** Real cost computed from totalTokensIn/totalTokensOut — this is the number to trust, not estimatedCostUsd. */
  actualCostUsd: number;
  failures: Array<{ sku: string; reason: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const VISION_MODEL = 'gemini-2.5-flash';

/** Gemini 2.5 Flash pricing (per token, May 2026 rate card). Used to convert
 *  REAL usageMetadata token counts into a real $ cost per row — see
 *  tokensIn/tokensOut/costUsd on VisionAttrs. This replaces guessing. */
const PRICE_PER_TOKEN_IN_USD = 0.30 / 1_000_000;
const PRICE_PER_TOKEN_OUT_USD = 2.50 / 1_000_000;

/** Gemini 2.5 Flash pricing: ~$0.30/1M input tokens, $2.50/1M output tokens.
 *  An image is ~258 tokens; output JSON is ~200 tokens. Two images + prompt
 *  ≈ 800 input tokens + 200 output ≈ $0.0007 per call. Round up to $0.001
 *  to be safe for billing estimates. (Catalogus-equivalent quality.)
 *  NOTE: this flat estimate is now only a fallback for failed calls where no
 *  usageMetadata exists — successful calls report REAL cost via tokensIn/Out. */
const COST_PER_CALL_USD = 0.001;

/** Max leads to process per upload — guard against runaway cost on big files */
const DEFAULT_MAX_LEADS = 300;

/** Max images to send per Vision call. Bumped from 2 → 4 because fit and
 *  pattern often need a full-body and/or back view to call correctly: a
 *  crop top photographed only at chest-up can look "regular" instead of
 *  "slim", and a checked shirt photographed only at the front in shadow
 *  can read as solid. Token cost rises modestly (~258 input tokens per
 *  extra image, ~$0.0001 per call at Flash rates) — worth it for accuracy. */
const MAX_IMAGES_PER_CALL = 4;

/** Image download timeout (ms) */
const DOWNLOAD_TIMEOUT_MS = 8000;

/** Max image size accepted (Gemini limit is 20MB; we cap at 5MB to keep calls fast) */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// LOV ENUMS for the Gemini JSON schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the response schema that constrains Gemini's output. Every enum field
 * lists the exact LOV values the model is allowed to return. The model also
 * gets to return "UNKNOWN" for any field it cannot determine confidently.
 */
function buildResponseSchema(): any {
  const enumWithUnknown = (values: readonly string[]) => ({
    type: 'STRING',
    enum: [...values, 'UNKNOWN'],
  });

  return {
    type: 'OBJECT',
    properties: {
      color_family: enumWithUnknown(LOV.color_family),
      color_specific: { type: 'STRING' },
      pattern: enumWithUnknown(LOV.pattern),
      pattern_detail: { type: 'STRING' },
      fabric_visual_hint: enumWithUnknown(LOV.fabric_family),
      neck_collar: enumWithUnknown(LOV.neck_collar),
      sleeve: enumWithUnknown(LOV.sleeve),
      sleeve_styling: enumWithUnknown(LOV.sleeve_styling),
      fit: enumWithUnknown(LOV.fit),
      dress_shape: enumWithUnknown(LOV.dress_shape),
      dress_length: enumWithUnknown(LOV.dress_length),
      tshirt_type: enumWithUnknown(LOV.tshirt_type),
      design_details: { type: 'STRING' },
      visual_description: { type: 'STRING' },
      has_embroidery: { type: 'BOOLEAN' },
      has_print: { type: 'BOOLEAN' },
      has_border: { type: 'BOOLEAN' },
      has_lace: { type: 'BOOLEAN' },
      has_sequins: { type: 'BOOLEAN' },
      confidence_overall: { type: 'NUMBER' },
    },
    required: ['color_family', 'pattern', 'visual_description'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const VISION_SYSTEM_PROMPT = `You are an expert fashion catalog analyst. You will be shown 1-2 product images of an apparel item. Your job is to extract structured attributes from what you visually observe.

CRITICAL RULES:
1. Output ONLY values from the allowed list for each enum field. The schema enforces this.
2. If you cannot determine a value with reasonable confidence, return "UNKNOWN" rather than guessing. Returning "UNKNOWN" is BETTER than returning a wrong value — the system will flag it for manual review, which is the right outcome.
3. For COLOR: identify the dominant color of the garment, not the model's skin or background. Pick the closest match from color_family. Use color_specific for nuance (e.g., "blush pink" when color_family is "Pink").
4. For FABRIC: this is hard to determine from photos alone. Only set fabric_visual_hint when the visual cues are strong (e.g., obvious denim weave, clear silk sheen, visible knit texture). Otherwise return "UNKNOWN" — the seller's stated fabric is more reliable.
5. For PATTERN — look closely at the GARMENT SURFACE itself, not at decorative elements:
   - "Solid" = single uniform color across the garment, no print or pattern visible. A small logo/badge does NOT make it "Graphic".
   - "Checked" = ANY visible check/plaid/gingham/windowpane grid pattern, regardless of scale or contrast.
   - "Striped" = visible parallel lines (vertical, horizontal, or diagonal).
   - "Floral" = flower motifs of any size.
   - "Printed" = an all-over print that isn't more specifically floral/animal/checked/striped/geometric.
   - "Graphic" = a discrete graphic, slogan, or large illustration on the front (typical of tees).
   Mistaking a checked shirt for "Solid" is a SERIOUS error — if you see ANY grid pattern, it is Checked, not Solid.
6. For NECK_COLLAR — identify the actual neckline as visible:
   - "Round Neck" = circular crew-like opening with NO collar piece.
   - "V-Neck" = pointed V-shaped opening.
   - "Shirt Collar" / "Spread Collar" = traditional shirt with a button-up collar piece.
   - "Polo Neck" = soft collar with a 2-3 button placket (polo shirt).
   - "Crew Neck" = ribbed close-fitting circular opening (t-shirt style).
   - "Boat Neck" = wide horizontal opening across collarbones.
   If the garment has a button-up collar piece, it is NOT "Round Neck" — pick the appropriate collar type.
7. For SLEEVE — measure where the sleeve ends on the model:
   - "Sleeveless" = no sleeve at all (tank, strap, etc.).
   - "Cap Sleeves" = very short sleeve barely covering the shoulder.
   - "Short Sleeves" / "Half Sleeves" = ends above the elbow.
   - "Three Quarter Sleeves" = ends between elbow and wrist.
   - "Full Sleeves" / "Long Sleeves" = reaches the wrist.
8. For FIT — assess the garment's silhouette on the model:
   - "Slim Fit" = closely follows body contours, narrow through torso/waist (typical of crop tops, fitted shirts, bodycon-adjacent).
   - "Regular Fit" = standard cut, not tight, not loose — neutral drape.
   - "Relaxed Fit" / "Loose Fit" = visibly roomy, hangs away from the body.
   - "Oversized Fit" / "Boxy Fit" = deliberately large, dropped shoulders, wide silhouette.
   - "Flared Fit" = fitted on top, flares out toward the hem (typical of fit-and-flare dresses).
   - "Bodycon Fit" = very tight, stretchy, hugs the body throughout (typical of bodycon dresses).
   A crop top that hugs the torso is "Slim Fit", NOT "Regular Fit". Look at how the fabric drapes — tight to body = slim/bodycon, neutral = regular, fabric hanging away = relaxed/oversized.
9. For DRESS_SHAPE: only fill if this is clearly a dress; identify the silhouette (bodycon, A-line, skater, maxi, etc.).
10. For DESIGN_DETAILS: free-form notes about embellishments like embroidery, sequins, lace trim, borders, contrast piping, ruffles, knots, etc. Be specific.
11. For VISUAL_DESCRIPTION: one sentence (~120 chars) describing what the product looks like in the image. This is used for catalog description copy, so be evocative but factual.
12. confidence_overall: 0.0 to 1.0 — your overall confidence that your extraction matches what's in the image. Be honest. If the image is clear and you are sure, this should be 0.9+. If anything is ambiguous, lower it. Do not output 0.9+ unless you are genuinely confident.

ACCURACY IS THE TOP PRIORITY. The downstream system will trust your output. A wrong value silently written into the catalog is worse than "UNKNOWN" that triggers manual review.

You are looking at a real product photo. Be precise. Do not invent details that are not visible.`;

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE DOWNLOAD
// ─────────────────────────────────────────────────────────────────────────────

interface DownloadedImage {
  url: string;
  data: Buffer;
  mimeType: string;
}

async function downloadImage(url: string): Promise<DownloadedImage | null> {
  if (!url || !url.startsWith('http')) return null;

  // Single retry on transient failure — CDN cold-cache hits, brief
  // network blips, and provider rate-limits clear on retry maybe 60-70%
  // of the time. The cost is one extra request worst case; the benefit
  // is not losing every flagged row when the seller's image host has a
  // 2-second slow patch.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await downloadImageOnce(url);
    if (result) return result;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function downloadImageOnce(url: string): Promise<DownloadedImage | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TataCLiQ-Enrichment/1.0' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const contentLength = Number(res.headers.get('content-length') ?? '0');
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;

    // Detect mime type from URL extension or content-type header
    let mimeType = res.headers.get('content-type') || '';
    if (!mimeType.startsWith('image/')) {
      const ext = url.split('?')[0].toLowerCase().split('.').pop();
      mimeType = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        webp: 'image/webp', gif: 'image/gif',
      }[ext ?? ''] ?? 'image/jpeg';
    }
    return { url, data: buf, mimeType };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT IMAGE URLs FROM A SELLER ROW
// ─────────────────────────────────────────────────────────────────────────────

function extractImageUrls(p: ParsedProduct): string[] {
  const urls: string[] = [];
  // Cover Image_1 through Image_10 — some sellers use up to 10 images.
  // MAX_IMAGES_PER_CALL caps how many we actually send to Vision; this
  // just ensures we don't lose visibility into images 9 and 10 that a
  // future MAX_IMAGES_PER_CALL bump could utilize.
  for (let i = 1; i <= 10; i++) {
    const v = p.raw[`Image_${i}`] ?? p.raw[`IMAGE_${i}`] ?? p.raw[`image_${i}`];
    if (v && typeof v === 'string' && v.startsWith('http')) {
      urls.push(v.trim());
    }
  }
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOV VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip any value that isn't in the allowed list. Returns undefined if invalid
 * or if the model returned "UNKNOWN".
 */
function validateEnumValue(value: any, lov: readonly string[]): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  if (value === 'UNKNOWN' || value === 'Unknown' || value === 'unknown') return undefined;
  const exact = lov.find((v) => v === value);
  if (exact) return exact;
  // Case-insensitive fallback
  const ci = lov.find((v) => v.toLowerCase() === value.toLowerCase());
  if (ci) return ci;
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALL GEMINI VISION FOR ONE LEAD
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeLead(
  model: GenerativeModel,
  leadSku: string,
  imageUrls: string[],
  context: { title?: string; description?: string; category?: string; gender?: string },
): Promise<VisionAttrs> {
  const attrs: VisionAttrs = {
    leadSku,
    confidence: {},
    imagesAnalyzed: 0,
  };

  // Download the first MAX_IMAGES_PER_CALL images
  const downloads = await Promise.all(
    imageUrls.slice(0, MAX_IMAGES_PER_CALL).map(downloadImage)
  );
  const images = downloads.filter((d): d is DownloadedImage => d !== null);

  if (images.length === 0) {
    attrs.error = 'No images could be downloaded';
    return attrs;
  }

  attrs.imagesAnalyzed = images.length;

  // Build the multi-modal request: prompt + image parts
  const parts: any[] = [{ text: VISION_SYSTEM_PROMPT }];
  for (const img of images) {
    parts.push({
      inlineData: {
        data: img.data.toString('base64'),
        mimeType: img.mimeType,
      },
    });
  }
  parts.push({
    text: `Please analyze the product in the images above. SKU reference: ${leadSku}.

SELLER-PROVIDED CONTEXT (cross-check your visual read against this — it often disambiguates things a photo alone can't, e.g. a top photographed on a hanger that could read as either "Top" or "Dress" framing, or a pattern that's ambiguous at a glance but named explicitly in the title):
Title: ${context.title ?? '(not provided)'}
Description: ${context.description ?? '(not provided)'}
Category: ${context.category ?? '(not provided)'}
Gender: ${context.gender ?? '(not provided)'}

If the seller's text and the image clearly agree, that raises your confidence. If they disagree, trust the image for visually-verifiable attributes (color, pattern, neckline, sleeve) but flag a lower confidence_overall rather than silently picking a side. Return the structured JSON.`,
  });

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1, // low temperature for consistent structured output
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(),
      },
    });

    const text = result.response.text();
    attrs.rawResponse = text;

    // ─── Real token usage, straight from Gemini — not an estimate ────────
    const usage = (result.response as any).usageMetadata;
    if (usage) {
      const tIn = usage.promptTokenCount ?? 0;
      const tOut = usage.candidatesTokenCount ?? 0;
      attrs.tokensIn = tIn;
      attrs.tokensOut = tOut;
      attrs.costUsd = tIn * PRICE_PER_TOKEN_IN_USD + tOut * PRICE_PER_TOKEN_OUT_USD;
    }

    const parsed = JSON.parse(text);

    // ─── LOV-validate every enum field ────────────────────────────────
    const colorFamily = validateEnumValue(parsed.color_family, LOV.color_family);
    const pattern = validateEnumValue(parsed.pattern, LOV.pattern);
    const fabric = validateEnumValue(parsed.fabric_visual_hint, LOV.fabric_family);
    const neckCollar = validateEnumValue(parsed.neck_collar, LOV.neck_collar);
    const sleeve = validateEnumValue(parsed.sleeve, LOV.sleeve);
    const sleeveStyling = validateEnumValue(parsed.sleeve_styling, LOV.sleeve_styling);
    const fit = validateEnumValue(parsed.fit, LOV.fit);
    const dressShape = validateEnumValue(parsed.dress_shape, LOV.dress_shape);
    const dressLength = validateEnumValue(parsed.dress_length, LOV.dress_length);
    const tshirtType = validateEnumValue(parsed.tshirt_type, LOV.tshirt_type);

    // Tolerantly parse confidence_overall — model occasionally returns a
    // string like "0.9" instead of a number.
    let parsedOverall: number | undefined;
    const rawOverall = parsed.confidence_overall;
    if (typeof rawOverall === 'number') {
      parsedOverall = rawOverall;
    } else if (typeof rawOverall === 'string' && rawOverall.trim()) {
      const n = parseFloat(rawOverall);
      if (!Number.isNaN(n)) parsedOverall = n;
    }
    // If the model didn't report any confidence at all, treat that as a
    // weak signal — 0.50 keeps us BELOW the 0.70 missing-fill floor so a
    // silent-on-confidence response correctly falls into manual review by
    // default, rather than confidently writing into the catalog. Previous
    // 0.75 default was just above the missing-fill floor, masking model
    // silence as a green light to auto-fill.
    const overallConf = parsedOverall !== undefined
      ? Math.max(0, Math.min(1, parsedOverall))
      : 0.50;
    // Store overall confidence in the per-field map too so downstream code
    // (the merge layer in enrichment-engine) has a sensible fallback when a
    // specific per-field confidence isn't recorded. Namespaced with a
    // double-underscore prefix so it can't ever collide with a real
    // catalog attribute named "confidence_overall".
    attrs.confidence.__overall = overallConf;

    if (colorFamily) {
      attrs.color_family = colorFamily;
      attrs.confidence.color_family = overallConf * 0.95;
    }
    if (pattern) {
      attrs.pattern = pattern;
      attrs.confidence.pattern = overallConf * 0.9;
    }
    if (fabric) {
      attrs.fabric_visual_hint = fabric;
      // Fabric is HARD from images — deliberately capped well below the
      // 0.70 missing-fill floor so it is always a flagged suggestion, never
      // silently written into the catalog. A viscose-look fabric can be
      // polyester; guessing wrong here is a compliance problem, not a
      // cosmetic one.
      attrs.confidence.fabric_visual_hint = overallConf * 0.5;
    }
    if (neckCollar) {
      attrs.neck_collar = neckCollar;
      attrs.confidence.neck_collar = overallConf * 0.9;
    }
    if (sleeve) {
      attrs.sleeve = sleeve;
      attrs.confidence.sleeve = overallConf * 0.92;
    }
    if (sleeveStyling) {
      attrs.sleeve_styling = sleeveStyling;
      attrs.confidence.sleeve_styling = overallConf * 0.85;
    }
    if (fit) {
      attrs.fit = fit;
      // Fit reads cleanly from a full-body shot of the model wearing the
      // item — comparable to neck/sleeve reliability, weighted slightly
      // lower because borderline cases (slim vs regular) are subjective.
      attrs.confidence.fit = overallConf * 0.88;
    }
    if (dressShape) {
      attrs.dress_shape = dressShape;
      attrs.confidence.dress_shape = overallConf * 0.88;
    }
    if (dressLength) {
      attrs.dress_length = dressLength;
      attrs.confidence.dress_length = overallConf * 0.88;
    }
    if (tshirtType) {
      attrs.tshirt_type = tshirtType;
      attrs.confidence.tshirt_type = overallConf * 0.85;
    }

    // Free-form fields don't need LOV validation
    if (typeof parsed.color_specific === 'string') attrs.color_specific = parsed.color_specific.slice(0, 80);
    if (typeof parsed.pattern_detail === 'string') attrs.pattern_detail = parsed.pattern_detail.slice(0, 200);
    if (typeof parsed.design_details === 'string') attrs.design_details = parsed.design_details.slice(0, 300);
    if (typeof parsed.visual_description === 'string') attrs.visual_description = parsed.visual_description.slice(0, 240);

    if (typeof parsed.has_embroidery === 'boolean') attrs.has_embroidery = parsed.has_embroidery;
    if (typeof parsed.has_print === 'boolean') attrs.has_print = parsed.has_print;
    if (typeof parsed.has_border === 'boolean') attrs.has_border = parsed.has_border;
    if (typeof parsed.has_lace === 'boolean') attrs.has_lace = parsed.has_lace;
    if (typeof parsed.has_sequins === 'boolean') attrs.has_sequins = parsed.has_sequins;

    return attrs;
  } catch (err: any) {
    attrs.error = err?.message ?? 'Vision call failed';
    // Preserve whatever the model DID return (if anything) so the operator
    // can see truncated JSON, a safety-filter refusal, etc. Without this,
    // a parse failure is an opaque error with no context.
    if (!attrs.rawResponse && typeof err?.responseText === 'string') {
      attrs.rawResponse = err.responseText.slice(0, 2000);
    }
    return attrs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: ANALYZE STYLE-FAMILY LEADS
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Max number of lead SKUs to send to Vision (cost guard) */
  maxLeads?: number;
  /** API key override (otherwise read from GEMINI_API_KEY env) */
  apiKey?: string;
}

/**
 * Analyze a list of style-family lead rows. Returns a Map keyed by lead SKU
 * with the extracted VisionAttrs, plus aggregate stats for the UI/usage page.
 */
export async function analyzeLeads(
  leads: ParsedProduct[],
  opts: AnalyzeOptions = {},
): Promise<{ visionMap: Map<string, VisionAttrs>; stats: VisionRunStats }> {
  const visionMap = new Map<string, VisionAttrs>();
  const stats: VisionRunStats = {
    leadsAttempted: 0,
    leadsSucceeded: 0,
    leadsFailed: 0,
    totalImagesDownloaded: 0,
    totalApiCalls: 0,
    estimatedCostUsd: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    actualCostUsd: 0,
    failures: [],
  };

  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No key — return empty map; caller will gracefully fall back to text-only
    return { visionMap, stats };
  }

  const maxLeads = Math.min(opts.maxLeads ?? DEFAULT_MAX_LEADS, leads.length);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: VISION_MODEL });

  // Process leads sequentially to avoid rate limits. Could be parallelized
  // with a concurrency limit (e.g., p-limit at 5) for faster batch runs.
  for (let i = 0; i < maxLeads; i++) {
    const lead = leads[i];
    if (!lead.sku) continue;
    const imageUrls = extractImageUrls(lead);
    if (imageUrls.length === 0) {
      stats.failures.push({ sku: lead.sku, reason: 'No image URLs in spreadsheet' });
      stats.leadsFailed++;
      continue;
    }

    stats.leadsAttempted++;
    stats.totalApiCalls++;
    stats.estimatedCostUsd += COST_PER_CALL_USD;

    const attrs = await analyzeLead(model, lead.sku, imageUrls, {
      title: lead.title ?? lead.raw['PRODUCT TITLE'] ?? lead.raw['Product Title'],
      description: lead.description ?? lead.raw['PRODUCT DESCRIPTION'] ?? lead.raw['Description'],
      category: lead.category ?? lead.raw['Product Type'],
      gender: lead.raw['Gender (Refer LOV List)'] ?? lead.raw['Gender'],
    });
    visionMap.set(lead.sku, attrs);
    stats.totalImagesDownloaded += attrs.imagesAnalyzed;

    if (attrs.error) {
      stats.failures.push({ sku: lead.sku, reason: attrs.error });
      stats.leadsFailed++;
    } else {
      stats.leadsSucceeded++;
      // Real usage, per row. Falls back to the flat per-call estimate only
      // if Gemini didn't return usageMetadata for some reason (shouldn't
      // happen in practice, but better than silently reporting zero cost).
      const tIn = attrs.tokensIn ?? 0;
      const tOut = attrs.tokensOut ?? 0;
      const rowCost = attrs.costUsd ?? COST_PER_CALL_USD;
      stats.totalTokensIn += tIn;
      stats.totalTokensOut += tOut;
      stats.actualCostUsd += rowCost;
      trackUsage({
        kind: 'catalog_enrich',
        engine: 'gemini',
        productCount: 1,
        tokensIn: tIn,
        tokensOut: tOut,
        costUsd: rowCost,
      });
    }
  }

  return { visionMap, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// MERGE LOGIC: per-attribute trust rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each attribute, decide who wins when seller and Vision disagree.
 *
 * "image" — Vision is more reliable. Trust the image; flag conflict for review.
 * "seller" — Seller knows better; ignore Vision for this field.
 * "merge" — Combine both (e.g., description: seller hook + Vision visual detail).
 */
const TRUST_RULES: Record<string, 'image' | 'seller' | 'merge'> = {
  color_family: 'image',
  pattern: 'image',
  neck_collar: 'image',
  sleeve: 'image',
  sleeve_styling: 'image',
  fit: 'image',
  dress_shape: 'image',
  dress_length: 'image',
  tshirt_type: 'image',
  // Fabric and material — seller knows what they sourced. Image is a hint only.
  fabric_family: 'seller',
  fabric: 'seller',
  // Administrative fields — seller authoritative
  hsn_code: 'seller',
  manufacturers_details: 'seller',
  importers_details: 'seller',
  packers_details: 'seller',
  country_of_origin: 'seller',
  mrp: 'seller',
  size: 'seller',
  brand: 'seller',
  brand_description: 'seller',
  // Descriptions — merge both sources
  description: 'merge',
};

/**
 * Confidence tiers, surfaced to the UI and the _QA sheet so a human reviewer
 * can tell at a glance which fields are safe to trust and which need a look.
 *
 * Business rule (explicit, final version, from the seller):
 *   - A MISSING mandatory field may be auto-filled by Vision at >= 70%
 *     confidence; below that, leave blank and flag for review.
 *   - A CONFLICT between seller data and Vision is only auto-corrected at
 *     confidence STRICTLY > 80%; at or below 80%, keep the seller's value
 *     and flag for manual review instead.
 *   Prioritize correctness over volume, but enrich aggressively within
 *   those two floors — manual review is for the cases that actually need it,
 *   not a dumping ground for everything below 100%.
 *
 *   HIGH   (> 0.80) — clears BOTH floors: fills missing fields and can
 *           override a seller-provided conflicting value.
 *   MEDIUM (0.70-0.80) — clears the missing-fill floor but NOT the conflict
 *           floor: fills a blank field, but won't overwrite a seller value
 *           that disagrees. Still shown in the audit trail either way.
 *   LOW    (< 0.70) — below both floors. Never auto-applied. Always a
 *           flagged suggestion for manual review.
 */
export type ConfidenceTier = 'high' | 'medium' | 'low';

export function confidenceTier(score: number): ConfidenceTier {
  if (score > 0.80) return 'high';
  if (score >= 0.70) return 'medium';
  return 'low';
}

/**
 * Two distinct thresholds per explicit business rule (the seller's own
 * numbered rules, latest version):
 *
 *  MISSING_FILL_FLOOR (70%) — when a mandatory field has NO seller value at
 *  all, Vision may fill it in if confidence >= 70%. Below that: leave blank,
 *  flag for manual review. ("infer and populate ... whenever confidence is
 *  70% or higher... If confidence is below 70%, do not guess.")
 *
 *  CONFLICT_OVERRIDE_FLOOR (80%, strict) — when the seller DID provide a
 *  value but Vision disagrees, only overwrite the seller's value if
 *  confidence is STRICTLY GREATER than 80%. At or below 80%: keep the
 *  seller's value, flag for manual review instead. ("If confidence ... is
 *  greater than 80%, automatically update... If confidence is 80% or below
 *  ... do not automatically overwrite.")
 *
 *  Every correction — auto-applied or not — must still appear in the
 *  Flagged Items / audit report with original value, corrected value,
 *  confidence, and reason. conflictFlag below is always populated for that
 *  reason, even on the auto-applied path.
 */
const MISSING_FILL_FLOOR = 0.70;
const CONFLICT_OVERRIDE_FLOOR = 0.80;

export interface MergeResult {
  finalValue: string;
  confidence: number;
  source: 'seller' | 'image' | 'merged' | 'normalized' | 'inferred';
  conflictFlag?: string;
  tier: ConfidenceTier;
  /** True when Vision auto-corrected a seller-provided value (>80% confidence
   *  conflict override). Audit/QA sheet should always list these explicitly,
   *  per the rule that auto-corrections still need a paper trail. */
  autoCorrected?: boolean;
}

/**
 * Merge a seller-provided value with a Vision-extracted value for one attribute.
 * Returns the final value to use, its confidence, source, and any conflict flag.
 */
export function mergeAttribute(
  attr: string,
  sellerValue: string | undefined,
  sellerConfidence: number,
  visionValue: string | undefined,
  visionConfidence: number,
): MergeResult {
  const rule = TRUST_RULES[attr] ?? 'seller';

  const hasSellerValue = !!(sellerValue && sellerValue.trim());
  const hasVisionValue = !!(visionValue && visionValue.trim());

  // No values from either
  if (!hasSellerValue && !hasVisionValue) {
    return { finalValue: '', confidence: 0, source: 'seller', tier: 'low' };
  }

  // Only one side has a value — use it
  if (hasSellerValue && !hasVisionValue) {
    return { finalValue: sellerValue!, confidence: sellerConfidence, source: 'seller', tier: confidenceTier(sellerConfidence) };
  }
  if (!hasSellerValue && hasVisionValue) {
    // MANDATORY FIELD MISSING case — rule 5/6: fill at >=70%, else flag+blank.
    if (visionConfidence < MISSING_FILL_FLOOR) {
      return {
        finalValue: '',
        confidence: visionConfidence,
        source: 'image',
        tier: 'low',
        conflictFlag: `Missing field — image suggests "${visionValue}" at ${Math.round(visionConfidence * 100)}% confidence, below the 70% auto-fill floor. Left blank for manual review.`,
      };
    }
    return { finalValue: visionValue!, confidence: visionConfidence, source: 'image', tier: confidenceTier(visionConfidence) };
  }

  // Both sides have values — agreement check
  const sellerNorm = (sellerValue ?? '').trim().toLowerCase();
  const visionNorm = (visionValue ?? '').trim().toLowerCase();

  if (sellerNorm === visionNorm) {
    // Agreement — boost confidence
    const boosted = Math.min(1.0, Math.max(sellerConfidence, visionConfidence) + 0.1);
    return {
      finalValue: sellerValue!,
      confidence: boosted,
      source: 'merged',
      tier: confidenceTier(boosted),
    };
  }

  // CONFLICT case — rule 8/10: only auto-correct if confidence > 80% (strict).
  // At or below 80%, keep the seller's value but still flag it for review.
  // Either way this is logged via conflictFlag for the audit trail (rule 9).
  if (rule === 'image') {
    if (visionConfidence > CONFLICT_OVERRIDE_FLOOR) {
      return {
        finalValue: visionValue!,
        confidence: visionConfidence,
        source: 'image',
        tier: confidenceTier(visionConfidence),
        autoCorrected: true,
        conflictFlag: `Auto-corrected: seller said "${sellerValue}", image showed "${visionValue}" at ${Math.round(visionConfidence * 100)}% confidence (>80% threshold) — value updated.`,
      };
    }
    return {
      finalValue: sellerValue!,
      // An unresolved conflict means we don't know who's right. Cap
      // confidence at 0.75 (MEDIUM tier) regardless of what either side
      // claimed — otherwise the QA sheet would list a disputed field as
      // "high-confidence" just because the seller's value was originally
      // 1.0, which is exactly the kind of false reassurance the reviewer
      // shouldn't get on a flagged row.
      confidence: Math.min(sellerConfidence, 0.75),
      source: 'seller',
      tier: confidenceTier(Math.min(sellerConfidence, 0.75)),
      conflictFlag: `Conflict not auto-resolved: seller said "${sellerValue}", image suggests "${visionValue}" at only ${Math.round(visionConfidence * 100)}% confidence (<=80% threshold) — kept seller's value, flagged for manual review.`,
    };
  }
  // 'seller' or 'merge' default → seller wins
  return {
    finalValue: sellerValue!,
    confidence: sellerConfidence,
    source: 'seller',
    tier: confidenceTier(sellerConfidence),
    conflictFlag: rule === 'merge' ? undefined : `image suggested "${visionValue}", kept seller's "${sellerValue}"`,
  };
}
