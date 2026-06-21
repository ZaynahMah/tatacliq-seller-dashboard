/**
 * Excel parsing + enriched Excel generation.
 * Runs in Next.js API routes (Node runtime).
 */
import * as XLSX from 'xlsx';

export interface ParsedProduct {
  rowIndex: number;
  sku?: string;
  title?: string;
  brand?: string;
  category?: string;
  mrp?: number;
  description?: string;
  color?: string;
  /** Explicit image filename from CSV column (e.g. "1_SKU123.png") */
  imageRef?: string;
  // Raw row data so we keep anything else the seller sent
  raw: Record<string, any>;
}

// Map common column name variations to canonical fields
const COLUMN_ALIASES: Record<string, keyof ParsedProduct> = {
  'product name': 'title',
  'product title': 'title',
  'item title': 'title',
  'title': 'title',
  'name': 'title',

  'sku': 'sku',
  'sku code': 'sku',
  'seller sku': 'sku',
  'seller article sku': 'sku',
  'article id': 'sku',
  'article sku': 'sku',
  'item code': 'sku',

  'brand': 'brand',
  'brand name': 'brand',

  'category': 'category',
  'product type': 'category',
  'item category': 'category',

  'mrp': 'mrp',
  'mrp (inr)': 'mrp',
  'price': 'mrp',
  'selling price': 'mrp',

  'description': 'description',
  'product description': 'description',
  'desc': 'description',

  'color': 'color',
  'colour': 'color',
  'color family': 'color',

  // Image filename references (per spec: "1_SKU123.png" matched to ZIP)
  'image': 'imageRef',
  'image url': 'imageRef',
  'image_url': 'imageRef',
  'image link': 'imageRef',
  'image name': 'imageRef',
  'image filename': 'imageRef',
  'product image': 'imageRef',
  'main image': 'imageRef',
  'excel image link': 'imageRef',
};

/**
 * Parse seller-uploaded Excel/CSV.
 *
 * Handles two layouts:
 *   (a) Simple: first row is column headers, data follows
 *   (b) Tata CLiQ template: 3-5 preamble rows (data types, MANDATORY flags,
 *       max-length numbers, etc.) BEFORE the actual column-name row
 *
 * The parser auto-detects which layout the file uses by scoring the first
 * ~10 rows for "header-like" content and picking the best one.
 */
export function parseExcelBuffer(buffer: ArrayBuffer): ParsedProduct[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = wb.Sheets[firstSheetName];

  // Read as raw 2D matrix so we can pick our own header row
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: '', raw: false, blankrows: false,
  });
  if (matrix.length === 0) return [];

  const headerRowIndex = detectHeaderRow(matrix);
  const headerRow = (matrix[headerRowIndex] ?? []).map((h) => String(h ?? '').trim());
  // The Tata CLiQ template has multiple preamble rows: type indicators
  // ("String"/"INTEGER"), MANDATORY/NON-MANDATORY flags, max-length numbers,
  // display labels, then attribute codes (#ATTR_xxx_Xxx / SKUCODE*). The
  // header detector picks the display-label row (best human-readable headers),
  // but the row IMMEDIATELY below it may still be a preamble row containing
  // the attribute codes — not real seller data. Detect and skip these so
  // the first "data row" isn't accidentally another header row.
  let firstDataIdx = headerRowIndex + 1;
  while (firstDataIdx < matrix.length && isPreambleRow(matrix[firstDataIdx])) {
    firstDataIdx++;
  }
  const dataRows = matrix.slice(firstDataIdx);

  return dataRows
    // Skip blank rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
    .map((row, idx) => {
      const raw: Record<string, any> = {};
      for (let i = 0; i < headerRow.length; i++) {
        const key = headerRow[i];
        if (key) raw[key] = row[i] ?? '';
      }
      const normalized: ParsedProduct = { rowIndex: firstDataIdx + idx + 1, raw };
      for (const [key, val] of Object.entries(raw)) {
        const aliasKey = key.toLowerCase().trim().replace(/\s*\(refer lov list\)\s*/g, '');
        const canonical = COLUMN_ALIASES[aliasKey];
        if (canonical) {
          if (canonical === 'mrp') {
            const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
            if (!isNaN(num)) (normalized as any)[canonical] = num;
          } else {
            (normalized as any)[canonical] = String(val).trim() || undefined;
          }
        }
      }
      return normalized;
    });
}

/**
 * Scan the first ~10 rows and pick the one most likely to be column headers.
 *
 * Heuristic:
 *   - Reward rows whose cells look like attribute names (e.g. "Product Type",
 *     "HSN CODE", "Seller Article SKU", "PRODUCT TITLE")
 *   - Penalize rows whose cells are data-type indicators ("String", "INTEGER",
 *     "ENUM"), MANDATORY/NON-MANDATORY flags, or pure numbers (max-length row)
 *
 * Returns the index of the best candidate header row (0-based).
 */
/**
 * Detect rows that are still part of the Tata CLiQ template preamble
 * (attribute-code rows like "SKUCODE*"/"#ATTR_xxx", type-indicator rows like
 * "String"/"INTEGER", MANDATORY/NON-MANDATORY flag rows). Used after the
 * header row is picked to skip any additional preamble rows that appear
 * between the chosen header and the first real seller data row.
 */
function isPreambleRow(row: any[] | undefined): boolean {
  if (!row) return false;
  const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean);
  if (cells.length === 0) return false;
  let preambleHits = 0;
  for (const s of cells) {
    if (/^(#ATTR_|[A-Z0-9_]+\*$)/.test(s)) preambleHits++;
    else if (/^(string|integer|enum|decimal|date|float|double|bool|boolean|text)/i.test(s)) preambleHits++;
    else if (/^(mandatory|non[-\s]?mandatory|optional|required)\*?$/i.test(s)) preambleHits++;
    else if (/^\d+(\.\d+)?$/.test(s) && cells.every((c) => /^\d+(\.\d+)?$/.test(c) || c === '')) preambleHits++;
  }
  // If more than half the non-blank cells look like preamble markers, it's a preamble row.
  return preambleHits / cells.length > 0.5;
}

function detectHeaderRow(matrix: any[][]): number {
  const TYPE_INDICATORS = /^(string|integer|enum|decimal(\(\d+\.\d+\))?|date(\(.*\))?|float|double|bool|boolean|text)$/i;
  const FLAG_INDICATORS = /^(mandatory|non[-\s]?mandatory|optional|required)\*?$/i;
  const PURE_NUMBER = /^\d+(\.\d+)?$/;
  const HEADER_KEYWORDS = /(sku|title|product|brand|color|colour|fabric|fit|size|hsn|mrp|name|description|sleeve|neck|pattern|gender|category|article|image|style|occasion|wash|age band|country|manufactur|importer|packer|ean|seller|tags|meta|warranty|weight|pack|model fit|story|season|key trend|business tag|net quantity|dangerous goods)/i;
  // Tata CLiQ MDD attribute-code rows look like "SKUCODE*", "TITLE*",
  // "#ATTR_colorapparel_Color*". These contain header keywords too, so
  // they score similarly to display-label rows ("Seller Article SKU",
  // "PRODUCT TITLE"). Detect them and penalize so the human-readable
  // display row wins when both are present (which is the common Tata
  // CLiQ template layout: row 3 = display labels, row 4 = attr codes).
  const ATTR_CODE_LIKE = /^(#ATTR_|[A-Z0-9_]+\*$)/;

  let bestScore = -Infinity;
  let bestIndex = 0;
  const scanLimit = Math.min(10, matrix.length);

  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i];
    if (!row || row.every((c) => !c && c !== 0)) continue;

    let score = 0;
    let nonEmpty = 0;

    for (const cell of row) {
      const s = String(cell ?? '').trim();
      if (!s) continue;
      nonEmpty++;

      if (TYPE_INDICATORS.test(s)) { score -= 8; continue; }
      if (FLAG_INDICATORS.test(s)) { score -= 8; continue; }
      if (PURE_NUMBER.test(s)) { score -= 5; continue; }
      // Penalize attribute-code-like cells so display-label rows win
      // when both score on HEADER_KEYWORDS.
      if (ATTR_CODE_LIKE.test(s)) { score -= 4; continue; }
      if (HEADER_KEYWORDS.test(s)) { score += 12; continue; }
      // Mildly reward title-case strings with spaces (typical attribute names)
      if (/^[A-Z]/.test(s) && /\s/.test(s) && s.length < 60) score += 2;
    }
    // Require at least a few non-empty cells to be considered a header
    if (nonEmpty < 5) continue;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export interface EnrichedProduct extends ParsedProduct {
  enriched: {
    product_type?: string;
    hsn_code?: string;
    fabric_family?: string;
    fabric_composition?: string;
    sleeve_type?: string;
    neck_collar?: string;
    neckline?: string;
    fit_type?: string;
    pattern?: string;
    occasion?: string;
    age_band?: string;
    wash_care?: string;
    country_of_origin?: string;
    manufacturer?: string;
    color_family?: string;
    seo_keywords?: string;
    enhanced_description?: string;
    enhanced_title?: string;
    features?: string;
    transparency?: string;
    pocket_type?: string;
    hemline?: string;
    cuff_style?: string;
    stitching?: string;
    branding_logo?: string;
    size_chart?: string;
    ean?: string;
  };
  confidence: number; // 0..100
  matchedImages: string[]; // filenames that matched this SKU
}

const MASTER_COLUMNS = [
  'sku',
  'ean',
  'title',
  'enhanced_title',
  'brand',
  'category',
  'product_type',
  'hsn_code',
  'mrp',
  'color_family',
  'fabric_family',
  'fabric_composition',
  'sleeve_type',
  'fit_type',
  'neck_collar',
  'neckline',
  'pattern',
  'occasion',
  'age_band',
  'wash_care',
  'country_of_origin',
  'manufacturer',
  'pocket_type',
  'hemline',
  'cuff_style',
  'transparency',
  'branding_logo',
  'stitching',
  'features',
  'size_chart',
  'seo_keywords',
  'enhanced_description',
  'image_1',
  'image_2',
  'image_3',
  'image_4',
  '_ai_confidence',
];

export function buildEnrichedExcel(products: EnrichedProduct[]): ArrayBuffer {
  const rows = products.map((p) => {
    const row: Record<string, any> = {};
    row.sku = p.sku ?? '';
    row.ean = p.enriched.ean ?? '';
    row.title = p.title ?? '';
    row.enhanced_title = p.enriched.enhanced_title ?? p.title ?? '';
    row.brand = p.brand ?? '';
    row.category = p.category ?? p.enriched.product_type ?? '';
    row.product_type = p.enriched.product_type ?? '';
    row.hsn_code = p.enriched.hsn_code ?? '';
    row.mrp = p.mrp ?? '';
    row.color_family = p.enriched.color_family ?? p.color ?? '';
    row.fabric_family = p.enriched.fabric_family ?? '';
    row.fabric_composition = p.enriched.fabric_composition ?? '';
    row.sleeve_type = p.enriched.sleeve_type ?? '';
    row.fit_type = p.enriched.fit_type ?? '';
    row.neck_collar = p.enriched.neck_collar ?? '';
    row.neckline = p.enriched.neckline ?? '';
    row.pattern = p.enriched.pattern ?? '';
    row.occasion = p.enriched.occasion ?? '';
    row.age_band = p.enriched.age_band ?? '';
    row.wash_care = p.enriched.wash_care ?? '';
    row.country_of_origin = p.enriched.country_of_origin ?? 'India';
    row.manufacturer = p.enriched.manufacturer ?? '';
    row.pocket_type = p.enriched.pocket_type ?? '';
    row.hemline = p.enriched.hemline ?? '';
    row.cuff_style = p.enriched.cuff_style ?? '';
    row.transparency = p.enriched.transparency ?? '';
    row.branding_logo = p.enriched.branding_logo ?? '';
    row.stitching = p.enriched.stitching ?? '';
    row.features = p.enriched.features ?? '';
    row.size_chart = p.enriched.size_chart ?? '';
    row.seo_keywords = p.enriched.seo_keywords ?? '';
    row.enhanced_description = p.enriched.enhanced_description ?? p.description ?? '';
    row.image_1 = p.matchedImages[0] ?? '';
    row.image_2 = p.matchedImages[1] ?? '';
    row.image_3 = p.matchedImages[2] ?? '';
    row.image_4 = p.matchedImages[3] ?? '';
    row._ai_confidence = `${p.confidence}%`;
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows, { header: MASTER_COLUMNS });

  // Auto-width columns based on header length
  ws['!cols'] = MASTER_COLUMNS.map((col) => ({ wch: Math.max(col.length + 2, 14) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Enriched Catalog');

  // Add a metadata sheet
  const metaWs = XLSX.utils.json_to_sheet([
    { key: 'Generated', value: new Date().toISOString() },
    { key: 'Total Products', value: products.length },
    { key: 'Source', value: 'TataCLiQ Seller Dashboard — AI Enrichment' },
    { key: 'Note', value: 'Cross-references: Myntra, Ajio, Amazon Fashion only. Never Tata CLiQ.' },
  ]);
  XLSX.utils.book_append_sheet(wb, metaWs, 'Metadata');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/**
 * Match image filenames to a product.
 *
 * Priority:
 *   1. Exact match on the `imageRef` field from the CSV (e.g. "1_SKU123.png")
 *      — then find all related siblings ("2_SKU123.png", "3_SKU123.png"...)
 *   2. Any filename containing the SKU
 *
 * Returns filenames sorted by leading number if present, else alphabetically.
 */
export function matchImagesToProduct(
  product: { sku?: string; imageRef?: string },
  allImages: string[],
): string[] {
  const { sku, imageRef } = product;

  // Build a normalized lookup
  const lower = new Map(allImages.map((n) => [n.toLowerCase(), n]));

  const matches = new Set<string>();

  // 1. Exact image ref match
  if (imageRef) {
    const refLower = imageRef.toLowerCase().trim();
    const direct = lower.get(refLower);
    if (direct) matches.add(direct);

    // Also try just the basename (CSV might have a full URL/path)
    const basename = refLower.split('/').pop() ?? refLower;
    if (basename !== refLower && lower.has(basename)) {
      matches.add(lower.get(basename)!);
    }

    // From the ref, extract a stem like "SKU123" to find siblings (1_, 2_, ...)
    const stem = extractStem(basename);
    if (stem) {
      for (const [normName, origName] of lower) {
        if (normName.includes(stem)) matches.add(origName);
      }
    }
  }

  // 2. SKU-based match
  if (sku) {
    const skuLower = sku.toLowerCase();
    for (const [normName, origName] of lower) {
      if (normName.includes(skuLower)) matches.add(origName);
    }
  }

  return Array.from(matches).sort(compareImageOrder);
}

function extractStem(filename: string): string | null {
  // "1_SKU123.png" -> "sku123"
  // "SKU123_front.jpg" -> "sku123"
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  const cleaned = base.replace(/^\d+[_-]/, '').replace(/[_-]\d+$/, '');
  const stem = cleaned.split(/[_\-\s]/)[0];
  return stem.length >= 3 ? stem.toLowerCase() : null;
}

function compareImageOrder(a: string, b: string): number {
  // Sort by leading numeric prefix when present ("1_X" < "2_X" < "10_X")
  const numA = parseInt(a.match(/^(\d+)/)?.[1] ?? '', 10);
  const numB = parseInt(b.match(/^(\d+)/)?.[1] ?? '', 10);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  return a.localeCompare(b);
}
