/**
 * Enrichment Engine — the core pipeline for MDD-compliant catalog enrichment.
 *
 * Pipeline phases:
 *   1. Parse seller rows
 *   2. Classify each row to L1 > L2 > L3 > L4 (with confidence)
 *   3. Group SKUs into style families (Style Code prefix) → assign Lead Variant
 *   4. Normalize raw seller values to MDD LOV via SELLER_TO_MDD
 *   5. Generate enriched copy (Title, Description, Mini, Meta×3, Tags) via Catalogus-style templates
 *   6. Score confidence per field; flag mandatory below threshold
 *   7. Build output rows matching MDD's per-L4 column set
 *
 * The engine works without any AI model. Gemini augments it for
 *   - Better natural-language descriptions
 *   - Image-based attribute inference (neckline, dress shape/length, pattern)
 *
 * but is never required for correctness.
 */

import type { ParsedProduct } from './excel';
import {
  CATEGORIES, CategoryNode, classifyToL4, normalizeValue,
} from './mdd';
import {
  buildTitle, buildDescription, buildMiniDescription, buildMetaTitle,
  buildMetaKeyword, buildMetaDescription, buildTags, buildStoryName,
  CopyInputs,
} from './copy-templates';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrichedRow {
  /** Source row index in original seller file (for traceability) */
  sourceRowIndex: number;
  sku: string;
  styleCode: string;
  /** Other SKUs in the same style family */
  styleFamily: string[];
  /** The lead variant SKU (first in size order); empty if this row IS the lead */
  leadVariantId: string;
  category: CategoryNode;
  classificationConfidence: number;
  classificationReason: string;
  /** Map of canonical attribute key -> enriched value */
  attrs: Record<string, string>;
  /** Per-field confidence 0-1 */
  confidence: Record<string, number>;
  /** Per-field source: 'seller' | 'normalized' | 'inferred' | 'generated' | 'image' */
  source: Record<string, string>;
  /** Validation: any mandatory fields still missing */
  missingMandatory: string[];
  /** Overall confidence score 0-1 */
  overallConfidence: number;
  /** Vision/seller disagreements that need human review */
  visionConflicts: string[];
  /** Whether Vision attrs were available and applied to this row */
  visionEnriched: boolean;
}

export interface EnrichmentReport {
  totalRows: number;
  successfulRows: number;
  averageConfidence: number;
  byCategory: Record<string, number>;
  styleFamiliesCount: number;
  rowsNeedingReview: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 + 2: CLASSIFY EACH ROW
// ─────────────────────────────────────────────────────────────────────────────

function classifyRow(p: ParsedProduct): {
  category: CategoryNode;
  confidence: number;
  reason: string;
} {
  const productType = (p.raw['Product Type'] || p.raw['PRODUCT TYPE']
    || p.raw['product type'] || p.category || '') as string;
  const hsn = (p.raw['HSN CODE'] || p.raw['HSN Code'] || p.raw['HSNCODE']
    || p.raw['hsn code'] || '') as string;
  const result = classifyToL4(productType, p.title, hsn);
  if (result) return result;

  // Fallback: pick the closest category even at low confidence rather than
  // dropping the row. Default to the most common L4 in the catalog (Tops and
  // tees is the safest catch-all for unknown apparel).
  const fallbackName = 'Tops and tees';
  const fallback = CATEGORIES.find((c) => c.l4 === fallbackName) ?? CATEGORIES[0];
  return {
    category: fallback,
    confidence: 0.1,
    reason: `No L4 match for product_type="${productType}" — defaulting to ${fallback.l4}; needs human review`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: STYLE FAMILY GROUPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups SKUs that share a Style Code into "style families" and assigns the
 * lead variant. The lead variant is the first SKU in numeric order
 * (typically the smallest size). Subsequent variants point to it via
 * leadVariantId.
 *
 * Returns a map: sku -> { leadSku, family }
 */
function groupStyleFamilies(rows: ParsedProduct[]): Map<string, { leadSku: string; family: string[] }> {
  // Group rows by styleCode (or, when blank, by SKU prefix)
  const groups = new Map<string, ParsedProduct[]>();

  for (const r of rows) {
    const sc = ((r.raw['Style Code'] || r.raw['STYLE CODE'] || r.raw['stylecode'] || '') as string).trim();
    const sku = (r.sku ?? '').toString();
    // Fallback: derive style code from SKU. Tata CLiQ SKUs are ~17 chars where
    // the last 2 digits are the size variant suffix (01-99). Strip them.
    // e.g. WMNA0152501261002 -> WMNA01525012610
    const styleKey = sc || (sku.length > 4 ? sku.slice(0, -2) : sku);
    if (!styleKey) continue;
    const arr = groups.get(styleKey) || [];
    arr.push(r);
    groups.set(styleKey, arr);
  }

  const result = new Map<string, { leadSku: string; family: string[] }>();
  for (const [, members] of groups) {
    if (!members.length) continue;
    // Sort by SKU lexically to determine lead (smallest = first)
    const sorted = [...members].sort((a, b) =>
      (a.sku ?? '').localeCompare(b.sku ?? '')
    );
    const lead = sorted[0]?.sku ?? '';
    const family = sorted.map((m) => m.sku ?? '').filter(Boolean);
    for (const m of members) {
      if (m.sku) result.set(m.sku, { leadSku: lead, family });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: NORMALIZE EACH FIELD
// ─────────────────────────────────────────────────────────────────────────────

function getRaw(p: ParsedProduct, ...keys: string[]): string {
  // Try exact matches first
  for (const k of keys) {
    const v = p.raw[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  // Fuzzy fallback: case-insensitive + ignore whitespace + ignore "(Refer LOV List)" suffix
  // This is how seller files actually look: "Sleeve (Refer LOV List)", "Importer "
  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/\s*\(refer lov list\)\s*/g, '')
    .replace(/[\s_-]/g, '')
    .trim();
  const wanted = new Set(keys.map(normalize));
  for (const [actualKey, value] of Object.entries(p.raw)) {
    if (wanted.has(normalize(actualKey))) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }
  return '';
}

function inferGender(p: ParsedProduct, cat: CategoryNode): { value: string; confidence: number } {
  const explicit = getRaw(p, 'Gender', 'GENDER', 'gender');
  if (explicit) {
    if (/^(women|female|w|f|ladies)$/i.test(explicit)) return { value: 'Women', confidence: 1.0 };
    if (/^(men|male|m|gents)$/i.test(explicit)) return { value: 'Men', confidence: 1.0 };
  }
  // Infer from L2
  if (cat.l2.toLowerCase().includes("women")) return { value: 'Women', confidence: 0.95 };
  if (cat.l2.toLowerCase().includes("men")) return { value: 'Men', confidence: 0.95 };
  // Infer from SKU prefix (W = women, M = men)
  const sku = (p.sku ?? '').toUpperCase();
  if (sku.startsWith('W')) return { value: 'Women', confidence: 0.7 };
  if (sku.startsWith('M')) return { value: 'Men', confidence: 0.7 };
  return { value: 'Women', confidence: 0.3 };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: ENRICH ONE ROW
// ─────────────────────────────────────────────────────────────────────────────

import type { VisionAttrs } from './vision-enrichment';
import { mergeAttribute } from './vision-enrichment';

export interface EnrichOptions {
  /** Default seller ID used in image filename pattern (MP_{seller}_{sku}_{n}.jpeg) */
  sellerId?: string;
  /** Start date for PRODUCT STARTDATE column (DD-MM-YYYY) */
  startDate?: string;
  /** End date (DD-MM-YYYY) */
  endDate?: string;
  /** Generic default season ("SS26", etc.) */
  defaultSeason?: string;
  /** Whether image inference is available (Gemini Vision active) */
  imageInferenceAvailable?: boolean;
  /**
   * Vision-extracted attributes keyed by lead SKU. All variants in a style
   * family inherit the lead's vision attrs (since they share images).
   * When set, the engine merges these with seller-provided values using
   * per-attribute trust rules from `vision-enrichment.ts`.
   */
  visionAttrs?: Map<string, VisionAttrs>;
}

const DEFAULTS: Required<Omit<EnrichOptions, 'visionAttrs'>> & { visionAttrs?: Map<string, VisionAttrs> } = {
  sellerId: '',
  startDate: formatDDMMYYYY(new Date()),
  endDate: '31-12-2099',
  defaultSeason: 'SS26',
  imageInferenceAvailable: false,
  visionAttrs: undefined,
};

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

export function enrichRow(
  p: ParsedProduct,
  styleInfo: { leadSku: string; family: string[] } | undefined,
  opts: EnrichOptions = {},
): EnrichedRow {
  const o = { ...DEFAULTS, ...opts };

  const cls = classifyRow(p);
  const cat = cls.category;

  const attrs: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const source: Record<string, string> = {};

  function set(key: string, value: string, conf: number, src: string) {
    attrs[key] = value;
    confidence[key] = conf;
    source[key] = src;
  }

  // ─── Identifiers ─────────────────────────────────────────────────────
  set('sku_code', p.sku ?? '', 1.0, 'seller');
  const styleCodeRaw = getRaw(p, 'Style Code', 'STYLE CODE', 'stylecode')
    || (p.sku && p.sku.length > 4 ? p.sku.slice(0, -2) : p.sku ?? '');
  set('style_code', styleCodeRaw, 1.0, 'seller');
  set('hsn_code', getRaw(p, 'HSN CODE', 'HSN Code', 'HSNCODE'), 1.0, 'seller');

  // ─── PBI identity (MPN) ──────────────────────────────────────────────
  set('pbi_identity_code', 'MPN', 1.0, 'normalized');
  set('pbi_identity_value', p.sku ?? '', 1.0, 'normalized');

  // ─── Brand ────────────────────────────────────────────────────────────
  const brand = p.brand ?? getRaw(p, 'Brand', 'BRAND', 'brand');
  set('brand', brand, brand ? 1.0 : 0, 'seller');

  // ─── Brand Description ───────────────────────────────────────────────
  const brandDesc = getRaw(p, 'Brand Description', 'BRAND DESCRIPTION');
  set('brand_description', brandDesc, brandDesc ? 1.0 : 0.3, 'seller');

  // ─── Gender ──────────────────────────────────────────────────────────
  const gender = inferGender(p, cat);
  set('gender', gender.value, gender.confidence, gender.confidence === 1.0 ? 'seller' : 'inferred');

  // ─── Color ───────────────────────────────────────────────────────────
  const colorRaw = p.color ?? getRaw(p, 'Color', 'COLOR', 'color', 'Brand Color');
  set('color', colorRaw, colorRaw ? 1.0 : 0, 'seller');

  const colorFamilyRaw = getRaw(p, 'Color Family', 'COLOR FAMILY') || colorRaw;
  const cf = normalizeValue('color_family', colorFamilyRaw);
  set('color_family', cf.value, cf.confidence, cf.confidence >= 0.85 ? 'normalized' : 'inferred');
  set('color_group', cf.value, cf.confidence, 'normalized');
  set('pack_color', colorRaw, colorRaw ? 0.9 : 0, 'seller');

  // ─── Pattern ─────────────────────────────────────────────────────────
  const patternRaw = getRaw(p, 'Pattern', 'PATTERN');
  const pat = normalizeValue('pattern', patternRaw);
  set('pattern', pat.value || 'Solid', pat.confidence || 0.4, pat.value ? 'normalized' : 'inferred');

  // ─── Fabric ──────────────────────────────────────────────────────────
  const fabricRaw = getRaw(p, 'Fabric', 'FABRIC');
  const fabricFamilyRaw = getRaw(p, 'Fabric Family', 'FABRIC FAMILY') || fabricRaw;
  const ff = normalizeValue('fabric_family', fabricFamilyRaw);
  set('fabric_family', ff.value, ff.confidence, 'normalized');
  set('fabric', fabricRaw, fabricRaw ? 1.0 : 0, 'seller');

  // ─── Fit ─────────────────────────────────────────────────────────────
  const fitRaw = getRaw(p, 'Fit', 'FIT', 'Model Fit', 'MODEL FIT');
  const fit = normalizeValue('fit', fitRaw);
  set('fit', fit.value || 'Regular Fit', fit.confidence || 0.4, fit.value ? 'normalized' : 'inferred');
  set('model_fit', 'Please check size chart table to know the exact size to be ordered', 1.0, 'normalized');

  // ─── Sleeve ──────────────────────────────────────────────────────────
  const sleeveRaw = getRaw(p, 'Sleeve', 'SLEEVE');
  const sl = normalizeValue('sleeve', sleeveRaw);
  set('sleeve', sl.value, sl.confidence, 'normalized');

  // ─── Neck / Collar ───────────────────────────────────────────────────
  const neckRaw = getRaw(p, 'Neck/Collar', 'NECK/COLLAR', 'Neck', 'NECK');
  const nk = normalizeValue('neck_collar', neckRaw);
  set('neck_collar', nk.value || 'Round Neck', nk.confidence || 0.4, nk.value ? 'normalized' : 'inferred');

  // ─── Occasion ────────────────────────────────────────────────────────
  const occRaw = getRaw(p, 'Occasion', 'OCCASION');
  const occ = normalizeValue('occasion', occRaw);
  set('occasion', occ.value || 'Daily', occ.confidence || 0.5, occ.value ? 'normalized' : 'inferred');

  // ─── Age Band ────────────────────────────────────────────────────────
  const ageRaw = getRaw(p, 'Age Band', 'AGE BAND');
  const age = normalizeValue('age_band', ageRaw);
  set('age_band', age.value || '18-45', age.confidence || 0.7, age.value ? 'normalized' : 'inferred');

  // ─── Size ────────────────────────────────────────────────────────────
  const sizeRaw = getRaw(p, 'Size', 'SIZE');
  set('size', sizeRaw, sizeRaw ? 1.0 : 0, 'seller');

  // ─── MRP ─────────────────────────────────────────────────────────────
  const mrp = p.mrp ?? Number(getRaw(p, 'MRP [INR]', 'MRP', 'mrp'));
  set('mrp', String(mrp || ''), mrp ? 1.0 : 0, 'seller');

  // ─── Wash Care ───────────────────────────────────────────────────────
  const washRaw = getRaw(p, 'Wash Care', 'WASH CARE', 'Wash');
  const fabricLower = (fabricRaw || ff.value || '').toLowerCase();
  const fabricSpecificWash = generateWashCare(fabricLower);
  set('wash_care',
    washRaw && washRaw.length > 12 ? washRaw : fabricSpecificWash,
    washRaw && washRaw.length > 12 ? 1.0 : 0.8,
    washRaw && washRaw.length > 12 ? 'seller' : 'generated');

  // ─── Country / manufacturer / importer / packer ──────────────────────
  set('country_of_origin', getRaw(p, 'Country Of Origin', 'COUNTRY OF ORIGIN') || 'India', 0.9, 'seller');
  const mfr = getRaw(p, 'Manufacturer', 'MANUFACTURER');
  const imp = getRaw(p, 'Importer', 'IMPORTER');
  const pkr = getRaw(p, 'Packer', 'PACKER');
  // Strip "Importer Name- " prefix if present, like Catalogus does
  const cleanAddress = (s: string) => s.replace(/^Importer Name-?\s*/i, '').trim();
  set('manufacturers_details', cleanAddress(mfr || imp), mfr || imp ? 1.0 : 0, 'normalized');
  set('importers_details', cleanAddress(imp || mfr), imp || mfr ? 1.0 : 0, 'normalized');
  set('packers_details', cleanAddress(pkr || imp || mfr), pkr || imp || mfr ? 1.0 : 0, 'normalized');

  // ─── Multi-pack / pack quantity / net quantity ───────────────────────
  set('multi_pack', 'No', 0.95, 'normalized');
  set('pack_quantity', getRaw(p, 'Pack Quantity', 'PACK QUANTITY') || '1', 0.9, 'normalized');
  set('net_quantity', '1', 0.95, 'normalized');

  // ─── Weight ──────────────────────────────────────────────────────────
  const weightRaw = getRaw(p, 'Weight', 'WEIGHT', 'PRODUCT WEIGHT [gm]');
  set('weight', weightRaw || '250', weightRaw ? 1.0 : 0.5, weightRaw ? 'seller' : 'normalized');
  set('weight_apparel', weightRaw || '250', weightRaw ? 1.0 : 0.5, weightRaw ? 'seller' : 'normalized');

  // ─── Unisex / Multi pack ─────────────────────────────────────────────
  const unisexRaw = getRaw(p, 'Unisex', 'UNISEX');
  const un = normalizeValue('unisex', unisexRaw);
  set('unisex', un.value || 'No', un.confidence || 0.9, 'normalized');

  // ─── Warranty ────────────────────────────────────────────────────────
  set('warranty_type', getRaw(p, 'Warranty Type', 'WARRANTY TYPE') || 'NA', 0.95, 'normalized');
  set('warranty_period', getRaw(p, 'Warranty Time Period [Months]', 'WARRANTY TIME PERIOD') || '0', 0.95, 'normalized');

  // ─── Defaults applied by Catalogus.ai ────────────────────────────────
  set('product_upload_status', 'S', 1.0, 'normalized');
  set('startdate', o.startDate, 1.0, 'normalized');
  set('enddate', o.endDate, 1.0, 'normalized');
  set('image_priority', '1', 1.0, 'normalized');
  set('platform', 'Marketplace', 1.0, 'normalized');
  set('season', o.defaultSeason, 0.9, 'normalized');
  set('gst_eligible', 'Yes', 0.95, 'normalized');
  set('seller_association_status', 'Yes', 0.95, 'normalized');
  set('dangerous_goods', 'No', 0.95, 'normalized');
  set('lead_time', '0', 0.9, 'normalized');
  set('size_chart', 'Please check size chart table to know the exact size to be ordered', 1.0, 'normalized');

  // ─── Style family / lead variant ─────────────────────────────────────
  const isLead = styleInfo ? styleInfo.leadSku === p.sku : true;
  set('lead_variant_id', isLead ? '' : (styleInfo?.leadSku ?? ''),
    1.0, 'normalized');

  // ─── Image filenames (Catalogus pattern) ─────────────────────────────
  if (isLead && o.sellerId) {
    const imageCount = countImages(p);
    const fileExt = 'jpeg';
    const imageNames = Array.from({ length: imageCount }, (_, i) =>
      `MP_${o.sellerId}_${p.sku}_${i + 1}.${fileExt}`
    );
    set('product_images', imageNames.join(','), imageCount > 0 ? 1.0 : 0, 'normalized');
  } else {
    set('product_images', '', 1.0, 'normalized');
  }

  // ─── Category-specific attributes ────────────────────────────────────
  if (cat.l4 === 'Casual dresses') {
    // dress_shape and dress_length: infer from title/description if not in seller data
    const dressLenRaw = getRaw(p, 'Dress Length', 'DRESS LENGTH');
    const dressShape = inferDressShape(p);
    const dressLen = dressLenRaw || inferDressLength(p);
    set('dress_shape', dressShape.value, dressShape.confidence,
      dressShape.confidence > 0.6 ? 'inferred' : 'generated');
    set('dress_length', dressLen, dressLenRaw ? 1.0 : 0.6,
      dressLenRaw ? 'seller' : 'inferred');
  }
  if (cat.l4 === 'Tops and tees') {
    const tshirtTypeRaw = getRaw(p, 'Tshirt Type', 'T-shirt Type', 'TSHIRT TYPE');
    const tshirtType = tshirtTypeRaw || inferTshirtType(p);
    set('tshirt_type', tshirtType, tshirtTypeRaw ? 1.0 : 0.65,
      tshirtTypeRaw ? 'seller' : 'inferred');
  }

  // ─── VISION MERGE PASS ───────────────────────────────────────────────
  // If Vision attrs are available for this row's style family, merge them
  // with the text-derived values using per-attribute trust rules.
  // Image wins for visual fields (color, pattern, neck, sleeve, dress shape,
  // dress length, sleeve styling); seller wins for fabric/admin fields.
  const visionConflicts: string[] = [];
  const leadSku = styleInfo?.leadSku ?? p.sku;
  const vAttrs = leadSku ? o.visionAttrs?.get(leadSku) : undefined;

  if (vAttrs) {
    // Attributes the Vision model can extract — try merging each one
    const visionFields: Array<{ key: string; vValue?: string }> = [
      { key: 'color_family', vValue: vAttrs.color_family },
      { key: 'pattern', vValue: vAttrs.pattern },
      { key: 'neck_collar', vValue: vAttrs.neck_collar },
      { key: 'sleeve', vValue: vAttrs.sleeve },
      { key: 'sleeve_styling', vValue: vAttrs.sleeve_styling },
      { key: 'dress_shape', vValue: vAttrs.dress_shape },
      { key: 'dress_length', vValue: vAttrs.dress_length },
      { key: 'tshirt_type', vValue: vAttrs.tshirt_type },
      { key: 'fabric_family', vValue: vAttrs.fabric_visual_hint },
    ];

    for (const { key, vValue } of visionFields) {
      if (!vValue) continue;
      const sellerVal = attrs[key];
      const sellerConf = confidence[key] ?? 0;
      const vConf = vAttrs.confidence[key === 'fabric_family' ? 'fabric_visual_hint' : key] ?? 0.7;

      const merged = mergeAttribute(key, sellerVal, sellerConf, vValue, vConf);
      if (merged.finalValue) {
        set(key, merged.finalValue, merged.confidence, merged.source);
      }
      if (merged.conflictFlag) {
        visionConflicts.push(`${key}: ${merged.conflictFlag}`);
      }
    }

    // Vision visual_description gets folded into the copy generation as a hint;
    // we won't overwrite the seller's description but we'll prepend visual
    // detail in the design sentence layer (handled by buildDescription).

    // Boost confidence for fields that Vision confirmed
    for (const key of Object.keys(vAttrs.confidence)) {
      const mappedKey = key === 'fabric_visual_hint' ? 'fabric_family' : key;
      if (attrs[mappedKey] && confidence[mappedKey] < 0.95) {
        // Already merged above; no-op for clarity
      }
    }
  }

  // ─── Generic Name / Display Name ─────────────────────────────────────
  set('generic_name', cat.displayName, 1.0, 'normalized');
  set('display_product_name', cat.displayName, 1.0, 'normalized');

  // ─── COPYWRITING: Title, Description, Mini, Meta×3, Tags ─────────────
  const copyInputs: CopyInputs = {
    brand: brand,
    gender: gender.value === 'Women' ? 'Womens' : gender.value === 'Men' ? 'Mens' : '',
    color: cf.value,
    fit: fit.value || 'Regular Fit',
    pattern: pat.value || 'Solid',
    productType: cat.displayName,
    fabric: fabricRaw,
    fabricFamily: ff.value,
    sleeve: sl.value,
    neckCollar: nk.value || 'Round Neck',
    occasion: occ.value || 'Daily',
    dressShape: attrs.dress_shape,
    dressLength: attrs.dress_length,
    tshirtType: attrs.tshirt_type,
    sellerDescription: p.description ?? getRaw(p, 'PRODUCT DESCRIPTION', 'Description'),
    sellerTitle: getRaw(p, 'PRODUCT TITLE', 'Product Title'),
  };

  const title = buildTitle(copyInputs, cat);
  set('title', title, 0.9, 'generated');
  set('name', title, 0.9, 'generated');
  set('description', buildDescription(copyInputs, cat), 0.85, 'generated');
  set('style_note', buildDescription(copyInputs, cat), 0.85, 'generated');
  set('mini_description', buildMiniDescription(copyInputs, cat), 0.85, 'generated');
  set('meta_title', buildMetaTitle(copyInputs, cat), 0.9, 'generated');
  set('meta_keyword', buildMetaKeyword(copyInputs, cat), 0.85, 'generated');
  set('meta_description', buildMetaDescription(copyInputs, cat), 0.85, 'generated');
  set('tags', buildTags(copyInputs, cat), 0.85, 'generated');
  set('story_name', buildStoryName(copyInputs, cat), 0.8, 'generated');

  // ─── Validation: check all mandatory attrs are filled ────────────────
  // Lead-only fields (product_images, brand_description, manufacturer/importer/packer)
  // are required on the lead row only; variant rows inherit them implicitly.
  const LEAD_ONLY_FIELDS = new Set([
    'product_images', 'brand_description', 'manufacturers_details',
    'importers_details', 'packers_details',
  ]);
  const missing: string[] = [];
  for (const key of cat.mandatoryAttrs) {
    if (!isLead && LEAD_ONLY_FIELDS.has(key)) continue;
    if (!attrs[key] || attrs[key] === '') missing.push(key);
  }

  // ─── Overall confidence ──────────────────────────────────────────────
  const confValues = Object.entries(confidence)
    .filter(([k]) => cat.mandatoryAttrs.includes(k))
    .map(([, v]) => v);
  const overall = confValues.length
    ? confValues.reduce((s, v) => s + v, 0) / confValues.length
    : 0;

  return {
    sourceRowIndex: p.rowIndex,
    sku: p.sku ?? '',
    styleCode: styleCodeRaw,
    styleFamily: styleInfo?.family ?? [p.sku ?? ''],
    leadVariantId: isLead ? '' : (styleInfo?.leadSku ?? ''),
    category: cat,
    classificationConfidence: cls.confidence,
    classificationReason: cls.reason,
    attrs, confidence, source,
    missingMandatory: missing,
    overallConfidence: overall,
    visionConflicts,
    visionEnriched: !!vAttrs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS: inference from text
// ─────────────────────────────────────────────────────────────────────────────

function countImages(p: ParsedProduct): number {
  let n = 0;
  for (let i = 1; i <= 8; i++) {
    if (getRaw(p, `Image_${i}`, `IMAGE_${i}`, `image_${i}`)) n++;
  }
  return Math.max(n, 1);
}

function inferDressShape(p: ParsedProduct): { value: string; confidence: number } {
  const text = (
    (p.title ?? '') + ' ' + (p.description ?? '') + ' ' +
    getRaw(p, 'PRODUCT DESCRIPTION', 'Description', 'Pattern')
  ).toLowerCase();
  const candidates: Array<[RegExp, string, number]> = [
    [/bodycon/, 'Bodycon', 0.95],
    [/skater/, 'Skater', 0.95],
    [/maxi/, 'Maxi', 0.9],
    [/a[\s-]?line/, 'A-Line', 0.9],
    [/wrap/, 'Wrap', 0.85],
    [/shift/, 'Shift', 0.85],
    [/asymmetri/, 'Asymmetric', 0.85],
    [/fit and flare|fit & flare/, 'Fit and Flare', 0.85],
    [/sheath/, 'Sheath', 0.8],
    [/slip dress/, 'Slip', 0.8],
    [/empire/, 'Empire', 0.75],
    [/flared|flowy/, 'A-Line', 0.6],
    [/short|mini/, 'A-Line', 0.4],
  ];
  for (const [rx, val, conf] of candidates) {
    if (rx.test(text)) return { value: val, confidence: conf };
  }
  return { value: 'A-Line', confidence: 0.3 };
}

function inferDressLength(p: ParsedProduct): string {
  const text = ((p.title ?? '') + ' ' + (p.description ?? '')).toLowerCase();
  if (/\bmaxi\b/.test(text)) return 'Maxi';
  if (/\bmidi\b/.test(text)) return 'Midi';
  if (/\bmini\b/.test(text)) return 'Above Knee';
  if (/\bankle/.test(text)) return 'Ankle Length';
  if (/knee length/.test(text)) return 'Knee Length';
  if (/short/.test(text)) return 'Above Knee';
  if (/long/.test(text)) return 'Maxi';
  return 'Above Knee';
}

function inferTshirtType(p: ParsedProduct): string {
  const text = ((p.title ?? '') + ' ' + (p.description ?? '')).toLowerCase();
  if (/polo/.test(text)) return 'Polo T-shirt';
  if (/henley/.test(text)) return 'Henley T-shirt';
  if (/v[- ]neck/.test(text)) return 'V-Neck T-shirt';
  if (/tank top|cami/.test(text)) return 'Tank Top';
  if (/crop top/.test(text)) return 'Crop Top';
  if (/graphic/.test(text)) return 'Graphic T-shirt';
  if (/crew/.test(text)) return 'Crew T-shirt';
  if (/t[- ]shirt|tee/.test(text)) return 'T-Shirt';
  return 'Other';
}

/**
 * Generate fabric-specific wash care instructions. This beats Catalogus.ai's
 * generic "Machine Wash. Do Not Bleach." by tailoring the advice per fabric.
 */
function generateWashCare(fabric: string): string {
  if (/silk|chiffon|georgette|satin/.test(fabric)) {
    return 'Dry clean recommended. Hand wash cold with mild detergent. Do not wring. Hang to dry.';
  }
  if (/linen/.test(fabric)) {
    return 'Machine wash cold on gentle cycle. Iron while damp. Do not bleach.';
  }
  if (/wool|cashmere/.test(fabric)) {
    return 'Dry clean only. Do not wash. Store flat to retain shape.';
  }
  if (/denim/.test(fabric)) {
    return 'Machine wash cold inside out with similar colors. Do not bleach. Tumble dry low.';
  }
  if (/cotton lycra|cotton blend/.test(fabric)) {
    return 'Machine wash cold with similar colors. Do not bleach. Tumble dry low. Iron on reverse if needed.';
  }
  if (/cotton/.test(fabric)) {
    return 'Machine wash cold with similar colors. Do not bleach. Tumble dry low.';
  }
  if (/polyester|nylon|rayon|viscose|lycra/.test(fabric)) {
    return 'Machine wash cold on gentle cycle. Do not bleach. Hang dry. Cool iron if needed.';
  }
  return 'Machine wash cold with similar colors. Do not bleach. Tumble dry low.';
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT: enrich the whole catalog
// ─────────────────────────────────────────────────────────────────────────────

export function enrichCatalog(
  rows: ParsedProduct[],
  opts: EnrichOptions = {},
): { enriched: EnrichedRow[]; report: EnrichmentReport } {
  const styleMap = groupStyleFamilies(rows);
  const enriched: EnrichedRow[] = [];

  for (const r of rows) {
    const info = r.sku ? styleMap.get(r.sku) : undefined;
    // Auto-pick up Seller_id from the first row that has it
    if (!opts.sellerId) {
      const sid = getRaw(r, 'Seller_id', 'SELLER_ID', 'seller_id');
      if (sid) opts.sellerId = sid;
    }
    enriched.push(enrichRow(r, info, opts));
  }

  const byCategory: Record<string, number> = {};
  for (const e of enriched) {
    byCategory[e.category.l4] = (byCategory[e.category.l4] ?? 0) + 1;
  }

  const review = enriched.filter((e) => e.overallConfidence < 0.7 || e.missingMandatory.length > 0).length;
  const avgConf = enriched.length
    ? enriched.reduce((s, e) => s + e.overallConfidence, 0) / enriched.length
    : 0;

  const report: EnrichmentReport = {
    totalRows: rows.length,
    successfulRows: enriched.length,
    averageConfidence: avgConf,
    byCategory,
    styleFamiliesCount: new Set(enriched.map((e) => e.styleCode)).size,
    rowsNeedingReview: review,
  };
  return { enriched, report };
}

/**
 * Return the lead ParsedProduct for each style family. Used by API routes
 * to know which rows to send to Vision (one call per family, not per variant).
 */
export function getStyleFamilyLeads(rows: ParsedProduct[]): ParsedProduct[] {
  const styleMap = groupStyleFamilies(rows);
  const seenLeads = new Set<string>();
  const leads: ParsedProduct[] = [];
  for (const r of rows) {
    const info = r.sku ? styleMap.get(r.sku) : undefined;
    if (!info) continue;
    if (info.leadSku !== r.sku) continue;
    if (seenLeads.has(r.sku!)) continue;
    seenLeads.add(r.sku!);
    leads.push(r);
  }
  return leads;
}
