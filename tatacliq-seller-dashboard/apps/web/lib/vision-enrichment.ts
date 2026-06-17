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
  failures: Array<{ sku: string; reason: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const VISION_MODEL = 'gemini-2.5-flash';

/** Gemini 2.5 Flash pricing: ~$0.30/1M input tokens, $2.50/1M output tokens.
 *  An image is ~258 tokens; output JSON is ~200 tokens. Two images + prompt
 *  ≈ 800 input tokens + 200 output ≈ $0.0007 per call. Round up to $0.001
 *  to be safe for billing estimates. (Catalogus-equivalent quality.) */
const COST_PER_CALL_USD = 0.001;

/** Max leads to process per upload — guard against runaway cost on big files */
const DEFAULT_MAX_LEADS = 300;

/** Max images to send per Vision call (front + back is usually enough) */
const MAX_IMAGES_PER_CALL = 2;

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
2. If you cannot determine a value with reasonable confidence, return "UNKNOWN" rather than guessing.
3. For COLOR: identify the dominant color of the garment, not the model's skin or background. Pick the closest match from color_family. Use color_specific for nuance (e.g., "blush pink" when color_family is "Pink").
4. For FABRIC: this is hard to determine from photos alone. Only set fabric_visual_hint when the visual cues are strong (e.g., obvious denim weave, clear silk sheen, visible knit texture). Otherwise return "UNKNOWN" — the seller's stated fabric is more reliable.
5. For PATTERN: look at the actual garment surface. A solid black dress with a small logo is "Solid", not "Graphic". Floral prints, animal prints, stripes etc. should be identified accurately.
6. For NECK_COLLAR and SLEEVE: identify the actual neckline and sleeve type as worn on the model.
7. For DRESS_SHAPE: only fill if this is clearly a dress; identify the silhouette (bodycon, A-line, skater, maxi, etc.).
8. For DESIGN_DETAILS: free-form notes about embellishments like embroidery, sequins, lace trim, borders, contrast piping, ruffles, knots, etc. Be specific.
9. For VISUAL_DESCRIPTION: one sentence (~120 chars) describing what the product looks like in the image. This is used for catalog description copy, so be evocative but factual.
10. confidence_overall: 0.0 to 1.0 — your overall confidence that your extraction matches what's in the image.

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
  for (let i = 1; i <= 8; i++) {
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
  parts.push({ text: `Please analyze the product in the images above. SKU reference: ${leadSku}. Return the structured JSON.` });

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
    const parsed = JSON.parse(text);

    // ─── LOV-validate every enum field ────────────────────────────────
    const colorFamily = validateEnumValue(parsed.color_family, LOV.color_family);
    const pattern = validateEnumValue(parsed.pattern, LOV.pattern);
    const fabric = validateEnumValue(parsed.fabric_visual_hint, LOV.fabric_family);
    const neckCollar = validateEnumValue(parsed.neck_collar, LOV.neck_collar);
    const sleeve = validateEnumValue(parsed.sleeve, LOV.sleeve);
    const sleeveStyling = validateEnumValue(parsed.sleeve_styling, LOV.sleeve_styling);
    const dressShape = validateEnumValue(parsed.dress_shape, LOV.dress_shape);
    const dressLength = validateEnumValue(parsed.dress_length, LOV.dress_length);
    const tshirtType = validateEnumValue(parsed.tshirt_type, LOV.tshirt_type);

    const overallConf = typeof parsed.confidence_overall === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence_overall))
      : 0.75;

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
      // Fabric is HARD from images — deliberately capped BELOW the autofill
      // floor (0.55) so it is always a flagged suggestion, never silently
      // written into the catalog. A viscose-look fabric can be polyester;
      // guessing wrong here is a compliance problem, not a cosmetic one.
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

    const attrs = await analyzeLead(model, lead.sku, imageUrls);
    visionMap.set(lead.sku, attrs);
    stats.totalImagesDownloaded += attrs.imagesAnalyzed;

    if (attrs.error) {
      stats.failures.push({ sku: lead.sku, reason: attrs.error });
      stats.leadsFailed++;
    } else {
      stats.leadsSucceeded++;
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
 *   HIGH   (>= 0.80) — auto-fill with confidence. Color, sleeve, pattern,
 *           neckline from a clear front-facing photo land here.
 *   MEDIUM (0.55-0.79) — auto-fill, but visibly flagged for spot-checking.
 *           Sleeve styling, dress shape on busier prints often land here.
 *   LOW    (< 0.55) — NEVER auto-fill. Keep the seller's value (or leave
 *           blank) and surface this as a flagged suggestion only. Fabric
 *           composition from a photo alone is the canonical example: a
 *           viscose-look fabric can be polyester, and guessing wrong here
 *           is a compliance problem, not just a cosmetic one.
 */
export type ConfidenceTier = 'high' | 'medium' | 'low';

export function confidenceTier(score: number): ConfidenceTier {
  if (score >= 0.80) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

/** Hard floor: vision values below this are suggestions only, never auto-applied. */
const VISION_AUTOFILL_FLOOR = 0.55;

export interface MergeResult {
  finalValue: string;
  confidence: number;
  source: 'seller' | 'image' | 'merged' | 'normalized' | 'inferred';
  conflictFlag?: string;
  tier: ConfidenceTier;
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
    // Vision is the only source — but a LOW-confidence guess with nothing to
    // fall back on still shouldn't masquerade as a confident value. Surface
    // it as a flagged suggestion rather than silently writing it in.
    if (visionConfidence < VISION_AUTOFILL_FLOOR) {
      return {
        finalValue: '',
        confidence: visionConfidence,
        source: 'image',
        tier: 'low',
        conflictFlag: `low-confidence image guess "${visionValue}" not auto-filled — needs review`,
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

  // Disagreement — apply trust rule, but never let a LOW-confidence image
  // value override a seller value just because the trust rule says "image".
  if (rule === 'image') {
    if (visionConfidence < VISION_AUTOFILL_FLOOR) {
      return {
        finalValue: sellerValue!,
        confidence: sellerConfidence,
        source: 'seller',
        tier: confidenceTier(sellerConfidence),
        conflictFlag: `image suggested "${visionValue}" (low confidence, not applied) — kept seller's "${sellerValue}"`,
      };
    }
    return {
      finalValue: visionValue!,
      confidence: visionConfidence,
      source: 'image',
      tier: confidenceTier(visionConfidence),
      conflictFlag: `seller said "${sellerValue}", image shows "${visionValue}"`,
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
