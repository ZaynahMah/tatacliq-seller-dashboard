/**
 * Copywriting templates learned from Catalogus.ai reference outputs.
 *
 * For each L4 category, defines:
 *   - Title formula
 *   - Description structure (sentence-by-sentence)
 *   - MetaTitle / MetaKeyword / MetaDescription / Tags patterns
 *   - MiniDescription pattern
 *
 * These are deterministic generators used as the *fallback* engine and as
 * structured prompts for the Gemini path.
 */

import type { CategoryNode } from './mdd';

export interface CopyInputs {
  brand: string;             // "Outzidr"
  gender: string;            // "Womens" / "Mens"
  color: string;             // "Black"
  fit: string;               // "Regular Fit"
  pattern: string;           // "Floral"
  productType: string;       // "Casual Dress"
  fabric: string;            // "Polyester"
  fabricFamily: string;      // "Polyester"
  sleeve: string;            // "Short Sleeves"
  neckCollar: string;        // "V-Neck"
  occasion: string;          // "Daily" / "Party"
  dressShape?: string;       // "A-Line"
  dressLength?: string;      // "Above Knee"
  tshirtType?: string;       // "T-Shirt"
  /** Original seller description (for tone/keyword carryover) */
  sellerDescription?: string;
  /** Original seller PRODUCT TITLE — used to extract the seller's own noun
   *  (e.g. "Top") when it conflicts with the L4 category classification
   *  (e.g. classified as "Casual Dresses" by HSN code, but seller calls it
   *  a top). Catalogus.ai does this; forcing the category noun produces
   *  titles like "Animal Print Ruffle Dress" for a product that is visibly
   *  a top, which is a real, demonstrable quality bug in naive enrichment.
   */
  sellerTitle?: string;
}

/**
 * Title formula learned from Catalogus.ai:
 *   {Brand} {Gender} {Color} {Fit} {Pattern} {ProductTypeNoun}
 *
 * Examples observed:
 *   "Outzidr Womens Black Regular Fit Floral Dress"
 *   "Outzidr Womens White Slim Fit Graphic T-Shirt"
 *   "Outzidr Womens Multi Slim Fit Animal Print Asymmetric Ruffle Top"
 */
export function buildTitle(inputs: CopyInputs, cat: CategoryNode): string {
  const parts: string[] = [];
  if (inputs.brand) parts.push(inputs.brand);
  if (inputs.gender) parts.push(inputs.gender);
  if (inputs.color && inputs.color.toLowerCase() !== 'multi') parts.push(inputs.color);
  else if (inputs.color) parts.push('Multi');
  if (inputs.fit) parts.push(inputs.fit);
  // Pattern: include "Solid" too — Catalogus.ai's own titles do ("...Slim Fit
  // Solid Dress"), so omitting it was a deviation from the reference, not an
  // improvement. A couple of LOV values read better expanded in a title even
  // though the stored attribute value stays the shorter canonical LOV term
  // (e.g. attrs.pattern stays "Animal" for LOV compliance, but the title
  // says "Animal Print" — exactly how Catalogus.ai's own output does it).
  const TITLE_PATTERN_DISPLAY: Record<string, string> = { Animal: 'Animal Print' };
  if (inputs.pattern) parts.push(TITLE_PATTERN_DISPLAY[inputs.pattern] ?? inputs.pattern);
  // Product-type noun
  const noun = inferTitleNoun(inputs, cat);
  parts.push(noun);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Known garment nouns we can recognize in a seller's own PRODUCT TITLE,
 * ordered so multi-word nouns are checked before their substrings
 * (e.g. "Ruffle Top" before "Top" — though we only need the head noun).
 */
const RECOGNIZED_TITLE_NOUNS = [
  'Top', 'Blouse', 'Shirt', 'T-Shirt', 'Tee', 'Tank', 'Camisole',
  'Dress', 'Gown', 'Jumpsuit', 'Playsuit', 'Romper',
  'Kurta', 'Kurti', 'Saree', 'Skirt', 'Jeans', 'Trousers', 'Shorts',
  'Jacket', 'Blazer', 'Cardigan', 'Sweater', 'Sweatshirt', 'Hoodie',
];

/**
 * Pull the trailing garment noun out of the seller's own product title.
 * Returns undefined if no recognized noun is found.
 *
 * Example: "Outzidr Multi Animal Print Assymetrical Ruffle Top" -> "Top"
 */
function extractSellerNoun(sellerTitle?: string): string | undefined {
  if (!sellerTitle) return undefined;
  const words = sellerTitle.trim().split(/\s+/);
  if (words.length === 0) return undefined;
  // Check the last word AND the last two words. Some sellers write nouns
  // with a space ("T shirt", "tank top") instead of a hyphen or single
  // token. Match the longer (two-word) noun first so "T shirt" wins over
  // "shirt", which would otherwise mis-label a graphic tee as a Shirt.
  const TWO_WORD_NOUNS: Array<[RegExp, string]> = [
    [/^t\s*shirt$/i, 'T-Shirt'],
    [/^tank\s*top$/i, 'Tank'],
    [/^crop\s*top$/i, 'Top'],
  ];
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(' ').replace(/[^a-zA-Z\s-]/g, '').trim();
    for (const [rx, noun] of TWO_WORD_NOUNS) {
      if (rx.test(lastTwo)) return noun;
    }
  }
  const lastWord = words[words.length - 1].replace(/[^a-zA-Z-]/g, '');
  const match = RECOGNIZED_TITLE_NOUNS.find(
    (n) => n.toLowerCase() === lastWord.toLowerCase(),
  );
  return match;
}

/**
 * Title noun logic, calibrated against Catalogus.ai's actual behavior:
 *
 * 1. If the seller's own title ends in a recognizable garment noun, USE IT —
 *    even when it conflicts with the L4 category. Catalogus does this: a
 *    product classified into "Casual Dresses" by HSN code but titled
 *    "...Ruffle Top" by the seller still gets "Top" in the final title
 *    ("Outzidr Womens Multi Slim Fit Animal Print Ruffle Top"). Forcing the
 *    category noun here would produce an inaccurate, seller-contradicting
 *    title.
 * 2. Only fall back to the category-derived noun when the seller's title is
 *    uninformative (no recognizable noun, e.g. a SKU-style title).
 * 3. For dresses, only append a length qualifier (Maxi/Midi) for non-default
 *    lengths. Catalogus's own outputs never say "Mini Dress" for the default
 *    "Above Knee" length — that one is just "Dress" — but does say
 *    "Maxi Dress" for Ankle Length. Always appending "Mini" was a bug.
 */
function inferTitleNoun(inputs: CopyInputs, cat: CategoryNode): string {
  const sellerNoun = extractSellerNoun(inputs.sellerTitle);
  if (sellerNoun) {
    // Dresses still get a length qualifier prefixed onto the seller's noun,
    // but only for non-default lengths, and only when the seller noun is
    // itself "Dress" or "Gown" (don't say "Maxi Top").
    if (sellerNoun === 'Dress' || sellerNoun === 'Gown') {
      if (inputs.dressLength === 'Maxi' || inputs.dressLength === 'Ankle Length') return 'Maxi ' + sellerNoun;
      if (inputs.dressLength === 'Midi') return 'Midi ' + sellerNoun;
    }
    return sellerNoun;
  }

  // Fallback: category-derived noun (seller title was uninformative)
  if (cat.l4 === 'Casual dresses') {
    if (inputs.dressLength === 'Maxi' || inputs.dressLength === 'Ankle Length') return 'Maxi Dress';
    if (inputs.dressLength === 'Midi') return 'Midi Dress';
    return 'Dress'; // Above Knee / default — no qualifier, matches Catalogus
  }
  if (cat.l4 === 'Tops and tees') {
    if (inputs.tshirtType?.toLowerCase().includes('t-shirt')) return 'T-Shirt';
    return 'Top';
  }
  if (cat.l4 === 'casual shirts') return 'Shirt';
  if (cat.l4 === 'Jeans') return 'Jeans';
  if (cat.l4 === 'Skirts') return 'Skirt';
  if (cat.l4 === 'Kurta & kurtis') return 'Kurta';
  if (cat.l4 === 'Sarees') return 'Saree';
  return cat.displayName;
}

/**
 * Description formula — calibrated against Catalogus.ai outputs.
 *
 * Structure (4-5 sentences, ~480-580 chars):
 *   1. Brand-anchored hook (preserve seller's original first sentence when it's
 *      good marketing copy; generate otherwise)
 *   2. Fabric/construction sentence with comfort claim
 *   3. Design-detail sentence (sleeve + neckline + shape/length)
 *   4. Occasion + emotional benefit
 *   5. Styling pairing suggestion (preserve seller's pairing when present)
 *
 * To beat Catalogus quality:
 *   - Preserve seller's marketing voice and specific pairings (Catalogus
 *     overwrites these with generic templates)
 *   - Use varied sentence openers per template index to avoid the templated
 *     feel when reading multiple descriptions in a row
 *   - Mention concrete fabric properties (breathable for cotton, lightweight
 *     for polyester, etc.)
 */
export function buildDescription(inputs: CopyInputs, cat: CategoryNode): string {
  const sellerSentences = splitSentences(inputs.sellerDescription);

  // Sentence 1: prefer seller's hook (often best marketing copy)
  const hook = sellerSentences[0] && sellerSentences[0].length > 30
    ? sellerSentences[0]
    : generateHook(inputs, cat);

  // Sentence 2: fabric + fit
  const fabricSentence = generateFabricFitSentence(inputs);

  // Sentence 3: design details (sleeve + neckline + shape)
  const designSentence = generateDesignSentence(inputs, cat);

  // Sentence 4: occasion + benefit
  const occasionSentence = generateOccasionSentence(inputs, cat);

  // Sentence 5: pairing — preserve seller's "Pair with X and Y" if present;
  // otherwise generate one. (Catalogus drops these — we keep them.)
  const sellerPairing = sellerSentences.find(s =>
    /\b(pair|combine|style|wear|complete|finish|complement|match)\b/i.test(s)
    && s.length > 25 && s.length < 220
  );
  const stylingSentence = sellerPairing ?? generateStylingSentence(inputs, cat);

  const parts = [hook, fabricSentence, designSentence, occasionSentence, stylingSentence]
    .filter(Boolean)
    .map(s => s.trim())
    .map(s => s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.');

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  // Soft cap at 580 chars (Catalogus targets ~500-560)
  if (text.length > 600) {
    // Drop the 4th sentence if too long (it's the most expendable)
    const trimmed = [hook, fabricSentence, designSentence, stylingSentence]
      .filter(Boolean).map(s => s.trim())
      .map(s => s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.')
      .join(' ').replace(/\s+/g, ' ').trim();
    return trimmed.slice(0, 595);
  }
  return text;
}

function splitSentences(text?: string): string[] {
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
}

function generateHook(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat).toLowerCase();
  const color = inputs.color?.toLowerCase() || 'striking';
  const patDesc = inputs.pattern && inputs.pattern !== 'Solid'
    ? `${inputs.pattern.toLowerCase()} `
    : '';
  // Vary the opener to avoid templated feel
  const openers = [
    `Elevate your wardrobe with this ${color} ${patDesc}${noun} from ${inputs.brand}.`,
    `Step into effortless style in this ${color} ${patDesc}${noun} by ${inputs.brand}.`,
    `Make a refined statement with this ${color} ${patDesc}${noun} from ${inputs.brand}.`,
    `Discover modern sophistication in this ${color} ${patDesc}${noun} by ${inputs.brand}.`,
  ];
  // Deterministic pick based on brand + product type so style families stay consistent
  const seed = (inputs.brand.length + noun.length + (inputs.color?.length ?? 0)) % openers.length;
  return openers[seed];
}

function generateFabricFitSentence(inputs: CopyInputs): string {
  const fab = (inputs.fabric || inputs.fabricFamily || 'premium').toLowerCase();
  const fit = (inputs.fit || 'flattering').toLowerCase();
  // Fabric-specific comfort claim
  const fabricProps: Record<string, string> = {
    'cotton': 'breathable, soft-handle cotton',
    'cotton lycra': 'breathable cotton lycra with a touch of stretch',
    'cotton blend': 'breathable cotton blend',
    'polyester': 'lightweight polyester',
    'polyester blend': 'easy-care polyester blend',
    'rayon': 'fluid, drape-friendly rayon',
    'rayon/viscose': 'fluid, drape-friendly rayon viscose',
    'viscose': 'fluid viscose',
    'linen': 'breathable, naturally textured linen',
    'silk': 'lustrous silk',
    'nylon': 'smooth, stretch-recovery nylon',
    'denim': 'sturdy denim',
    'lycra': 'high-stretch lycra',
    'chiffon': 'airy, sheer chiffon',
    'georgette': 'flowing georgette',
    'satin': 'glossy satin',
  };
  const fabPhrase = fabricProps[fab] ?? `comfortable ${fab}`;
  return `Crafted from ${fabPhrase}, it features a ${fit} silhouette designed for all-day ease`;
}

function generateDesignSentence(inputs: CopyInputs, cat: CategoryNode): string {
  const parts: string[] = [];
  const sleeve = inputs.sleeve?.toLowerCase();
  const neck = inputs.neckCollar?.toLowerCase();

  if (sleeve && sleeve !== 'sleeveless') parts.push(sleeve);
  else if (sleeve === 'sleeveless') parts.push('sleeveless cut');

  if (neck && neck !== 'other') parts.push(`${neck} detail`);

  if (cat.l4 === 'Casual dresses' && inputs.dressShape) {
    parts.push(`${inputs.dressShape.toLowerCase()} silhouette`);
  }

  if (parts.length === 0) {
    return 'The thoughtfully considered cut and modern lines add a polished finish';
  }
  // Join with commas + final "and"; avoid duplicate "and" connectors
  let joined: string;
  if (parts.length === 1) joined = parts[0];
  else if (parts.length === 2) joined = `${parts[0]} and ${parts[1]}`;
  else joined = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;

  const openers = ['The', 'A', 'With its'];
  const seed = parts.length % openers.length;
  return `${openers[seed]} ${joined} bring a contemporary, considered touch to the design`;
}

function generateOccasionSentence(inputs: CopyInputs, cat: CategoryNode): string {
  const occ = (inputs.occasion || 'casual').toLowerCase();
  const occasionDescriptions: Record<string, string> = {
    'daily': 'daily wear, brunches, and weekend outings',
    'casual': 'casual outings, coffee dates, and city strolls',
    'party': 'evening events, cocktail hours, and night-outs',
    'formal': 'formal meetings, professional gatherings, and presentations',
    'wedding': 'wedding functions, receptions, and family celebrations',
    'festive': 'festive occasions, family functions, and special celebrations',
    'sports': 'workouts, gym sessions, and athletic activities',
    'beach': 'beach holidays, resort wear, and poolside lounging',
    'office': 'office wear, meetings, and professional days',
    'travel': 'travel days, weekend getaways, and exploration',
    'lounge': 'lounging at home, lazy weekends, and easy comfort',
  };
  const desc = occasionDescriptions[occ] ?? `${occ} occasions`;
  return `Perfect for ${desc}, it strikes the balance between contemporary style and everyday wearability`;
}

function generateStylingSentence(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat).toLowerCase();
  const isDress = cat.l4 === 'Casual dresses';
  const isTop = cat.l4 === 'Tops and tees';
  const isShirt = cat.l4 === 'casual shirts';
  const occ = (inputs.occasion || 'daily').toLowerCase();

  if (isDress) {
    return occ === 'party'
      ? `Pair this ${noun} with strappy heels and a metallic clutch for a polished evening look`
      : `Pair this ${noun} with woven flats and minimal jewellery for an effortless daytime look`;
  }
  if (isTop) {
    return occ === 'party'
      ? `Style this ${noun} with high-waisted trousers and statement heels to complete the look`
      : `Pair this ${noun} with jeans or tailored trousers for an easy off-duty silhouette`;
  }
  if (isShirt) {
    return `Layer this ${noun} over a tank or pair it with tailored bottoms for a put-together finish`;
  }
  return `Easy to dress up or down depending on the occasion`;
}

/**
 * MiniDescription: 1 sentence summary, ~150 chars.
 * Pattern: "This {color} {fit} {pattern} {noun} features {fabric} fabric and {key detail}."
 */
export function buildMiniDescription(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat).toLowerCase();
  const color = inputs.color?.toLowerCase() || '';
  const fit = inputs.fit?.toLowerCase() || '';
  const pat = inputs.pattern && inputs.pattern !== 'Solid' ? inputs.pattern.toLowerCase() + ' ' : '';
  const fab = (inputs.fabric || inputs.fabricFamily || 'soft').toLowerCase();
  const detail = inputs.sleeve ? inputs.sleeve.toLowerCase() : 'a refined silhouette';
  return `This ${color} ${fit} ${pat}${noun} features ${fab} fabric and ${detail} for a chic, comfortable look.`
    .replace(/\s+/g, ' ').trim();
}

/**
 * MetaTitle: ~100 chars, SEO-optimized brand-first structure.
 * Pattern: "{Brand} {Gender} {Color} {Pattern} {Fit} {Noun}"
 */
export function buildMetaTitle(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat);
  const parts = [
    inputs.brand,
    inputs.gender,
    inputs.color,
    inputs.pattern && inputs.pattern !== 'Solid' ? inputs.pattern : '',
    inputs.fit,
    noun,
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * MetaKeyword: 5-7 comma-separated SEO keywords.
 */
export function buildMetaKeyword(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat);
  const kws: string[] = [];
  if (inputs.brand) kws.push(inputs.brand);
  kws.push(`${inputs.gender} ${noun}`);
  if (inputs.color) kws.push(`${inputs.color} ${noun}`);
  if (inputs.pattern && inputs.pattern !== 'Solid') kws.push(`${inputs.pattern} ${noun}`);
  if (inputs.fit) kws.push(`${inputs.fit} ${noun}`);
  if (inputs.fabric) kws.push(`${inputs.fabric} ${noun}`);
  if (inputs.occasion) kws.push(`${inputs.occasion} wear`);
  return kws.slice(0, 7).join(', ');
}

/**
 * MetaDescription: ~200 chars, action-oriented sentence.
 */
export function buildMetaDescription(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat).toLowerCase();
  const fab = (inputs.fabric || inputs.fabricFamily || '').toLowerCase();
  const color = (inputs.color || '').toLowerCase();
  const fit = inputs.fit?.toLowerCase() || 'flattering';
  const pat = inputs.pattern && inputs.pattern !== 'Solid' ? inputs.pattern.toLowerCase() : '';

  return `Shop this ${inputs.brand} ${inputs.gender.toLowerCase()} ${color} ${pat} ${noun}. Made from ${fab} with a ${fit} silhouette, it's perfect for ${(inputs.occasion || 'daily').toLowerCase()} wear and easy styling.`
    .replace(/\s+/g, ' ').trim();
}

/**
 * Tags: comma-separated filter tags.
 */
export function buildTags(inputs: CopyInputs, cat: CategoryNode): string {
  const noun = inferTitleNoun(inputs, cat);
  const tags: string[] = [];
  if (inputs.brand) tags.push(inputs.brand);
  tags.push(`${inputs.gender} ${noun}`);
  if (inputs.color) tags.push(`${inputs.color} ${noun}`);
  if (inputs.pattern && inputs.pattern !== 'Solid') tags.push(`${inputs.pattern} Print`);
  if (inputs.occasion) tags.push(`${inputs.occasion} Wear`);
  if (inputs.fit) tags.push(inputs.fit);
  return tags.slice(0, 6).join(', ');
}

/**
 * Story Name: derived internal story code Catalogus.ai uses for grouping.
 * Pattern observed: {BRAND}_{GENDER_INITIAL}_FY{YY}_{CATEGORY}_{SUBCATEGORY}_ALL_ALPHA
 */
export function buildStoryName(inputs: CopyInputs, cat: CategoryNode): string {
  const brand = (inputs.brand || 'BRAND').toUpperCase();
  const g = inputs.gender?.toLowerCase().startsWith('men') ? 'M' : 'W';
  const fy = 'FY26';
  let segment = 'CATEGORY';
  if (cat.l4 === 'Casual dresses') {
    segment = `DRESS_${(inputs.dressLength === 'Maxi' || inputs.dressLength === 'Ankle Length') ? 'MAXI' : 'MINI'}`;
  } else if (cat.l4 === 'Tops and tees') {
    segment = 'TOPANDTEES';
  } else if (cat.l4 === 'casual shirts') {
    segment = 'SHIRTS';
  }
  return `${brand}_${g}_${fy}_${segment}_ALL_ALPHA`;
}
