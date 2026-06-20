/**
 * Master Data Dictionary (MDD) for Tata CLiQ Apparel category.
 *
 * Encodes:
 *  - L1 > L2 > L3 > L4 taxonomy hierarchy
 *  - Mandatory vs Optional attributes per L4 category
 *  - List-of-Values (LOV) for enum attributes
 *  - Seller→MDD value normalization map (learned from Catalogus.ai patterns)
 *
 * This file is the source of truth for the enrichment engine. The engine reads
 * it to know which attributes to fill for which product, what values are valid,
 * and how to translate raw seller data into MDD-compliant values.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY HIERARCHY (L1 > L2 > L3 > L4)
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryNode {
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  /** Display name used in the Generic Name and Display Product Name fields */
  displayName: string;
  /** HSN code prefix(es) typically associated with this category */
  hsnPrefixes: string[];
  /** Synonyms a seller might use for this L4 (lowercased) */
  sellerSynonyms: string[];
  /** Mandatory PIM attributes for this L4 (canonical attribute keys) */
  mandatoryAttrs: string[];
  /** Optional PIM attributes for this L4 */
  optionalAttrs: string[];
}

// Core MDD subset focused on Women's Apparel L4s that match the Outzidr catalog.
// Each entry tells the enrichment engine exactly which fields it must produce
// and which are nice-to-have.
const COMMON_MANDATORY = [
  'product_upload_status', 'hsn_code', 'sku_code', 'title', 'name', 'description',
  'startdate', 'product_images', 'weight', 'fabric_family', 'generic_name',
  'style_note', 'age_band', 'color', 'brand_description', 'fit', 'brand',
  'weight_apparel', 'seller_association_status', 'size_chart', 'warranty_type',
  'lead_time', 'wash_care', 'style_code', 'occasion', 'manufacturers_details',
  'multi_pack', 'net_quantity', 'display_product_name', 'platform',
  'model_fit', 'color_family', 'importers_details', 'warranty_period',
  'mrp', 'fabric', 'pack_quantity', 'size', 'packers_details',
  'country_of_origin',
];

const COMMON_OPTIONAL = [
  'mini_description', 'meta_title', 'meta_keyword', 'meta_description', 'tags',
  'pbi_identity_code', 'pbi_identity_value', 'enddate', 'review',
  'image_priority', 'video_url', 'country_of_manufacturer',
  'length', 'width', 'height', 'up_sell_associated_products', 'freebie',
  'color_group', 'feature', 'gst_eligible', 'additional_details_1',
  'additional_details_2', 'additional_details_3', 'key_trends',
  'up_sell_associated_product_status', 'cross_sell_associated_product_status',
  'cross_sell_associated_products', 'unisex', 'gender', 'sleeve_styling',
  'lead_variant_id', 'season', 'business_tag', 'pack_color', 'dangerous_goods',
  'story_name',
];

export const CATEGORIES: CategoryNode[] = [
  // ─── Women's Western Wear ──────────────────────────────────────────────
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Western Wear",
    l4: 'Casual dresses', displayName: 'Casual Dresses',
    hsnPrefixes: ['6104', '6204', '6109'],
    sellerSynonyms: [
      'casual dress', 'dress', 'mini dress', 'maxi dress', 'midi dress',
      'short dress', 'long dress', 'a-line dress', 'bodycon dress',
      'skater dress', 'shift dress', 'wrap dress',
    ],
    mandatoryAttrs: [
      ...COMMON_MANDATORY,
      'pattern', 'neck_collar', 'sleeve', 'dress_length',
      // NOTE: 'dress_shape' deliberately removed — the golden sheet has no
      // Dress Shape column at all (confirmed against the real accepted
      // file), so there's nowhere to write it even if Vision infers it.
      // Leaving it in mandatoryAttrs would just make every dress row show
      // a phantom "missing mandatory field" with no way to resolve it.
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Western Wear",
    l4: 'Tops and tees', displayName: 'Tops And Tees',
    hsnPrefixes: ['6106', '6109', '6206', '6108'],
    sellerSynonyms: [
      'top', 'tops', 't-shirt', 'tshirt', 'tee', 'tees', 'tops & t-shirts',
      'tops and t-shirts', 'graphic t-shirt', 'crop top', 'cami top',
      'blouse top', 'ruffle top',
    ],
    mandatoryAttrs: [
      ...COMMON_MANDATORY,
      'pattern', 'neck_collar', 'sleeve',
    ],
    optionalAttrs: [...COMMON_OPTIONAL, 'tshirt_type'],
  },
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Western Wear",
    l4: 'casual shirts', displayName: 'Casual Shirts',
    hsnPrefixes: ['6206', '6106', '6204'],
    sellerSynonyms: [
      'casual shirt', 'shirt', 'button-down', 'button down', 'collared shirt',
      'gingham shirt', 'check shirt', 'printed shirt',
    ],
    mandatoryAttrs: [
      ...COMMON_MANDATORY,
      'pattern', 'neck_collar', 'sleeve',
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Western Wear",
    l4: 'Jeans', displayName: 'Jeans',
    hsnPrefixes: ['6204'],
    sellerSynonyms: ['jeans', 'denim', 'denim jeans', 'skinny jeans', 'bootcut jeans'],
    mandatoryAttrs: [
      ...COMMON_MANDATORY,
      'pattern', 'denim_treatments', 'waist_rise', 'jeans_length',
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Western Wear",
    l4: 'Skirts', displayName: 'Skirts',
    hsnPrefixes: ['6104', '6204'],
    sellerSynonyms: ['skirt', 'mini skirt', 'midi skirt', 'maxi skirt', 'pleated skirt'],
    mandatoryAttrs: [
      ...COMMON_MANDATORY, 'pattern', 'skirt_shape', 'skirt_length',
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
  // ─── Women's Ethnic ────────────────────────────────────────────────────
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Ethnic",
    l4: 'Kurta & kurtis', displayName: 'Kurta & Kurtis',
    hsnPrefixes: ['6104', '6204', '6211'],
    sellerSynonyms: ['kurta', 'kurti', 'anarkali', 'straight kurta', 'a-line kurta'],
    mandatoryAttrs: [
      ...COMMON_MANDATORY,
      'pattern', 'neck_collar', 'sleeve',
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
  {
    l1: 'Apparel', l2: "Women's Apparel", l3: "Women's Ethnic",
    l4: 'Sarees', displayName: 'Sarees',
    hsnPrefixes: ['5407', '5208', '6211'],
    sellerSynonyms: ['saree', 'sari', 'silk saree', 'cotton saree'],
    mandatoryAttrs: [
      ...COMMON_MANDATORY, 'pattern', 'with_blouse',
    ],
    optionalAttrs: COMMON_OPTIONAL,
  },
];

export function findCategoryByL4(l4: string): CategoryNode | undefined {
  const target = l4.toLowerCase().trim();
  return CATEGORIES.find((c) => c.l4.toLowerCase() === target);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST OF VALUES (LOV) — accepted enum values per attribute
// ─────────────────────────────────────────────────────────────────────────────
//
// These are the *exact* values the Tata CLiQ portal will accept. The enrichment
// engine normalizes anything the seller wrote into one of these.

/**
 * Accepted values per attribute. SOURCE OF TRUTH HIERARCHY (explicit decision
 * from the seller, confirmed against real files):
 *
 *   - The official MDD_PCM_ETAIL_V1_9_Apparel.xlsx (v1.9, dated 2016-2018) is
 *     the BASE for category structure and which attributes are mandatory.
 *   - For actual accepted VALUES and casing/formatting, the golden sheet
 *     (golden_sheet_for_seller_portal.xlsx — the real file already accepted
 *     by the live Seller Portal) is authoritative, because the MDD's exact
 *     LOV strings are partly stale: MDD says "Slim fit"/"Print"/"Casual Wear"
 *     lowercase-style; the golden sheet (and this list) use "Slim Fit",
 *     "Printed", "Daily" — Title Case, more specific, what the portal
 *     actually accepted. Do NOT "correct" these back to MDD casing.
 *   - Where the golden sheet's only 85 SKUs don't exercise every valid MDD
 *     value (e.g. it never has an XXL or a "Wedding Wear" occasion), the MDD
 *     value is included anyway as a real possibility for other sellers' data
 *     — these lists are a superset, not just "what 85 rows happened to use."
 *   - Verified discrepancies kept deliberately: 'Polyster Blend' (sic) and
 *     'Navy Blue' are typo'd/non-MDD strings that are nonetheless literally
 *     present in the portal-accepted golden sheet, so they're accepted here
 *     too rather than flagged as errors.
 */
export const LOV = {
  age_band: ['18-25', '18-45', '25-45', 'Adult', 'Kids', 'Teens', 'Senior'],

  color_family: [
    'Black', 'White', 'Grey', 'Navy', 'Navy Blue', 'Blue', 'Red', 'Pink', 'Orange',
    'Yellow', 'Green', 'Brown', 'Purple', 'Beige', 'Maroon', 'Gold',
    'Silver', 'Multi', 'Olive', 'Teal',
  ],

  fit: [
    'Regular Fit', 'Slim Fit', 'Relaxed Fit', 'Loose Fit', 'Skinny Fit',
    'Tailored Fit', 'Flared Fit', 'Bodycon Fit', 'Oversized Fit', 'Boxy Fit',
  ],

  sleeve: [
    'Sleeveless', 'Cap Sleeves', 'Short Sleeves', 'Three Quarter Sleeves',
    'Full Sleeves', 'Roll Up Sleeves', 'Half Sleeves', 'Long Sleeves',
  ],

  neck_collar: [
    'Round Neck', 'V-Neck', 'Crew Neck', 'Polo Neck', 'Turtle Neck', 'Boat Neck',
    'Square Neck', 'Sweetheart Neck', 'Halter Neck', 'One Shoulder',
    'Off Shoulder', 'High Neck', 'Cowl Neck', 'Mandarin Collar', 'Shirt Collar',
    'Spread Collar', 'Notched Lapel', 'Peter Pan Collar', 'Tie-Up Neck', 'Other',
  ],

  pattern: [
    'Solid', 'Printed', 'Floral', 'Striped', 'Checked', 'Polka Dots',
    'Animal', 'Graphic', 'Embroidered', 'Embellished', 'Color Block',
    'Geometric', 'Abstract', 'Tribal', 'Pleated', 'Self Design', 'Tie & Dye',
  ],

  occasion: [
    'Daily', 'Casual', 'Party', 'Formal', 'Wedding', 'Festive', 'Sports',
    'Beach', 'Office', 'Travel', 'Lounge',
  ],

  fabric_family: [
    'Cotton', 'Polyester', 'Polyester Blend', 'Polyster Blend', 'Viscose', 'Rayon', 'Linen',
    'Silk', 'Wool', 'Denim', 'Nylon', 'Lycra', 'Spandex', 'Chiffon', 'Georgette',
    'Crepe', 'Modal', 'Lyocell', 'Cotton Lycra', 'Cotton Blend', 'Satin',
  ],

  dress_shape: [
    'Bodycon', 'A-Line', 'Skater', 'Maxi', 'Shift', 'Wrap', 'Sheath',
    'Fit and Flare', 'Asymmetric', 'Empire', 'Slip', 'Tunic',
  ],

  dress_length: [
    'Above Knee', 'Knee Length', 'Below Knee', 'Midi', 'Ankle Length', 'Maxi',
  ],

  skirt_shape: [
    'A-Line', 'Pencil', 'Pleated', 'Flared', 'Wrap', 'Asymmetric', 'Tiered',
  ],

  skirt_length: ['Mini', 'Above Knee', 'Knee Length', 'Midi', 'Ankle Length', 'Maxi'],

  tshirt_type: [
    'T-Shirt', 'Crew T-shirt', 'Polo T-shirt', 'Henley T-shirt',
    'V-Neck T-shirt', 'Tank Top', 'Crop Top', 'Graphic T-shirt',
  ],

  unisex: ['Yes', 'No'],

  multi_pack: ['Yes', 'No'],

  gender: ['Women', 'Men', 'Unisex', 'Girls', 'Boys'],

  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free Size'],

  platform: ['Marketplace', 'Direct'],

  season: ['SS26', 'AW26', 'SS27', 'AW27', 'All Season'],

  waist_rise: ['Low Rise', 'Mid Rise', 'High Rise'],

  warranty_type: ['No', 'Yes', 'Manufacturer', 'NA'],

  sleeve_styling: [
    'Regular Sleeves', 'Bell Sleeves', 'Puff Sleeves', 'Flutter Sleeves',
    'Bishop Sleeves', 'Cape Sleeves', 'Cold Shoulder', 'Roll Up', 'Raglan',
    'Kimono', 'One Shoulder', 'Halter',
  ],
} as const;

export type LOVKey = keyof typeof LOV;

// ─────────────────────────────────────────────────────────────────────────────
// SELLER → MDD NORMALIZATION MAP
// ─────────────────────────────────────────────────────────────────────────────
//
// Maps every seller phrasing we've seen onto the canonical MDD LOV value.
// Add new mappings here as new seller dialects show up.

export const SELLER_TO_MDD: Record<string, Record<string, string>> = {
  fit: {
    'regular fit': 'Regular Fit',
    'regular': 'Regular Fit',
    'slim fit': 'Slim Fit',
    'slim': 'Slim Fit',
    'relaxed fit': 'Relaxed Fit',
    'relaxed': 'Relaxed Fit',
    'flaired fit': 'Flared Fit',
    'flared fit': 'Flared Fit',
    'loose fit': 'Loose Fit',
    'skinny fit': 'Skinny Fit',
    'bodycon': 'Bodycon Fit',
    'boxy fit': 'Boxy Fit',
    'oversized fit': 'Oversized Fit',
    'oversized': 'Oversized Fit',
    'tailored fit': 'Tailored Fit',
  },
  sleeve: {
    'sleeveless': 'Sleeveless',
    'short sleeve': 'Short Sleeves',
    'short sleeves': 'Short Sleeves',
    'half sleeve': 'Short Sleeves',
    'half sleeves': 'Short Sleeves',
    'full sleeve': 'Full Sleeves',
    'full sleeves': 'Full Sleeves',
    'long sleeve': 'Full Sleeves',
    'long sleeves': 'Full Sleeves',
    'cap sleeve': 'Cap Sleeves',
    'cap sleeves': 'Cap Sleeves',
    'three quarter sleeve': 'Three Quarter Sleeves',
    'three quarter sleeves': 'Three Quarter Sleeves',
    '3/4 sleeve': 'Three Quarter Sleeves',
    'roll up sleeve': 'Roll Up Sleeves',
  },
  neck_collar: {
    'round neck': 'Round Neck',
    'v neck': 'V-Neck',
    'v-neck': 'V-Neck',
    'crew neck': 'Crew Neck',
    'turtle neck': 'Turtle Neck',
    'boat neck': 'Boat Neck',
    'square neck': 'Square Neck',
    'halter neck': 'Halter Neck',
    'halter': 'Halter Neck',
    'one shoulder': 'One Shoulder',
    'off shoulder': 'Off Shoulder',
    'high neck': 'High Neck',
    'cowl neck': 'Cowl Neck',
    'mandarin collar': 'Mandarin Collar',
    'mandarin': 'Mandarin Collar',
    'shirt collar': 'Shirt Collar',
    'spread collar': 'Spread Collar',
    'sweetheart': 'Sweetheart Neck',
    'sweetheart neck': 'Sweetheart Neck',
    'tie-up neck': 'Tie-Up Neck',
    'tie up neck': 'Tie-Up Neck',
    'polo neck': 'Polo Neck',
    'other': 'Other',
  },
  pattern: {
    'solid': 'Solid',
    'plain': 'Solid',
    'floral': 'Floral',
    'striped': 'Striped',
    'stripes': 'Striped',
    'checked': 'Checked',
    'checks': 'Checked',
    'check': 'Checked',
    'gingham check': 'Checked',
    'polka dots': 'Polka Dots',
    'polka': 'Polka Dots',
    'animal print': 'Animal',
    'animal': 'Animal',
    'graphic': 'Graphic',
    'graphic print': 'Graphic',
    'print': 'Printed',
    'printed': 'Printed',
    'embroidered': 'Embroidered',
    'embellished': 'Embellished',
    'color block': 'Color Block',
    'colour block': 'Color Block',
    'geometric': 'Geometric',
    'abstract': 'Abstract',
    'pleated': 'Pleated',
    'self design': 'Self Design',
    'tie & dye': 'Tie & Dye',
    'tie and dye': 'Tie & Dye',
  },
  color_family: {
    black: 'Black', white: 'White', grey: 'Grey', gray: 'Grey',
    'navy blue': 'Navy', navy: 'Navy',
    blue: 'Blue', 'sky blue': 'Blue', 'royal blue': 'Blue',
    red: 'Red', maroon: 'Maroon', wine: 'Maroon',
    pink: 'Pink', 'hot pink': 'Pink', fuchsia: 'Pink',
    orange: 'Orange', peach: 'Orange',
    yellow: 'Yellow', mustard: 'Yellow',
    green: 'Green', olive: 'Olive', teal: 'Teal',
    brown: 'Brown', tan: 'Brown', beige: 'Beige', cream: 'Beige',
    purple: 'Purple', lavender: 'Purple', lilac: 'Purple',
    gold: 'Gold', silver: 'Silver', multi: 'Multi',
    multicolor: 'Multi', 'multi color': 'Multi', 'multi-color': 'Multi',
  },
  fabric_family: {
    'cotton': 'Cotton',
    'cotton lycra': 'Cotton',
    'cotton blend': 'Cotton Blend',
    'cotton polyblend': 'Polyester Blend',
    'polyester': 'Polyester',
    'polyester blend': 'Polyester Blend',
    'polyster blend': 'Polyester Blend',
    'viscose': 'Viscose',
    'rayon': 'Rayon',
    'rayon/viscose': 'Rayon',
    'lycra': 'Lycra',
    'linen': 'Linen',
    'silk': 'Silk',
    'wool': 'Wool',
    'denim': 'Denim',
    'nylon': 'Nylon',
    'spandex': 'Spandex',
    'chiffon': 'Chiffon',
    'georgette': 'Georgette',
    'crepe': 'Crepe',
    'modal': 'Modal',
    'satin': 'Satin',
    'polyamide': 'Nylon',
  },
  occasion: {
    'casual': 'Daily',
    'casual wear': 'Daily',
    'daily': 'Daily',
    'daily wear': 'Daily',
    'party': 'Party',
    'party wear': 'Party',
    'party & club wear': 'Party',
    'club wear': 'Party',
    'formal': 'Formal',
    'formal wear': 'Formal',
    'office wear': 'Office',
    'office': 'Office',
    'wedding': 'Wedding',
    'wedding wear': 'Wedding',
    'festive': 'Festive',
    'festival': 'Festive',
    'sports': 'Sports',
    'beach': 'Beach',
    'travel': 'Travel',
    'lounge': 'Lounge',
  },
  age_band: {
    'adult': '18-45',
    'adults': '18-45',
    '18-45': '18-45',
    '18-25': '18-25',
    '25-45': '25-45',
    'kids': 'Kids',
    'teens': 'Teens',
    'senior': 'Senior',
  },
  unisex: {
    'no': 'No',
    'n': 'No',
    'false': 'No',
    'yes': 'Yes',
    'y': 'Yes',
    'true': 'Yes',
  },
  multi_pack: {
    'no': 'No',
    'n': 'No',
    'yes': 'Yes',
    'y': 'Yes',
  },
};

/**
 * Normalize a raw seller value to its MDD-canonical form. Returns the input
 * unchanged when no mapping exists (so we don't lose data) along with a
 * confidence score: 1.0 = exact LOV match, 0.85 = mapped via SELLER_TO_MDD,
 * 0.0 = no normalization applied.
 */
export function normalizeValue(
  attr: LOVKey,
  raw: string | undefined | null,
): { value: string; confidence: number; original: string } {
  const original = (raw ?? '').toString().trim();
  if (!original) return { value: '', confidence: 0, original: '' };

  const lov = LOV[attr] as readonly string[];
  // Exact case-insensitive match against LOV
  const exact = lov.find((v) => v.toLowerCase() === original.toLowerCase());
  if (exact) return { value: exact, confidence: 1.0, original };

  // Mapped via seller→mdd dictionary
  const map = SELLER_TO_MDD[attr];
  if (map) {
    const mapped = map[original.toLowerCase()];
    if (mapped) return { value: mapped, confidence: 0.85, original };
  }

  // Substring match: "Navy Blue" → Navy
  for (const candidate of lov) {
    if (original.toLowerCase().includes(candidate.toLowerCase())) {
      return { value: candidate, confidence: 0.6, original };
    }
  }

  return { value: original, confidence: 0, original };
}

// ─────────────────────────────────────────────────────────────────────────────
// L4 CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a seller's "Product Type" string (e.g. "Casual Dress", "Tops & T-shirts")
 * to the most likely L4 category. Uses synonym matching + HSN code hints.
 *
 * Returns the matched category and a confidence score (0-1).
 */
export function classifyToL4(
  productType: string | undefined,
  title: string | undefined,
  hsnCode: string | undefined,
): { category: CategoryNode; confidence: number; reason: string } | null {
  const pt = (productType ?? '').toLowerCase().trim();
  const t = (title ?? '').toLowerCase();
  const hsn = String(hsnCode ?? '').replace(/\D/g, '').slice(0, 4);

  const scored = CATEGORIES.map((cat) => {
    let score = 0;
    const reasons: string[] = [];

    // Direct L4 match on Product Type
    if (pt && cat.l4.toLowerCase() === pt) {
      score += 0.7;
      reasons.push(`L4 name matches "${pt}"`);
    }
    // Synonym match on Product Type
    if (pt && cat.sellerSynonyms.some((s) => s === pt)) {
      score += 0.6;
      reasons.push(`Product Type synonym "${pt}"`);
    }
    // Partial Product Type match — only when one is genuinely a substring
    // and at least 5 chars long, to avoid spurious 1-2-char matches that
    // could cross-classify (e.g. "shirt" wrongly matching every category
    // whose synonyms happen to contain "shirt" as a suffix).
    if (pt && pt.length >= 5 && cat.sellerSynonyms.some((s) =>
      s.length >= 5 && (pt.includes(s) || s.includes(pt))
    )) {
      score += 0.3;
      reasons.push(`Partial PT match`);
    }
    // Title keyword match
    if (t) {
      const titleMatches = cat.sellerSynonyms.filter((s) => t.includes(s));
      if (titleMatches.length) {
        score += 0.2 * Math.min(titleMatches.length, 2);
        reasons.push(`Title mentions ${titleMatches.slice(0, 2).join(', ')}`);
      }
    }
    // HSN code prefix match
    if (hsn && cat.hsnPrefixes.includes(hsn)) {
      score += 0.25;
      reasons.push(`HSN ${hsn} typical for L4`);
    }

    return { cat, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.2) return null;
  return {
    category: best.cat,
    confidence: Math.min(best.score, 1.0),
    reason: best.reasons.join('; '),
  };
}
