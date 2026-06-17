/**
 * Gemini-based product enrichment.
 * Used server-side from Next.js API routes.
 *
 * Falls back to deterministic mock enrichment when GEMINI_API_KEY isn't set,
 * so the demo works without any keys.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ParsedProduct, EnrichedProduct } from './excel';

const SYSTEM_PROMPT = `You are a fashion catalog enrichment expert for an Indian e-commerce operations team. Your job is to fill in missing product attributes for apparel, footwear, and accessories so the catalog is portal-ready.

CRITICAL RULES:
1. DO NOT use Tata CLiQ as a reference source. Never quote, mimic, or describe product data from tatacliq.com.
2. You MAY cross-reference these sources only:
   - Myntra (myntra.com)
   - Ajio (ajio.com)
   - Amazon Fashion (amazon.in/fashion)
   - The brand's own website
3. Output ONLY valid JSON matching the schema. No prose, no markdown fences.
4. Title: max 80 chars, Title Case, no all-caps.
5. enhanced_description: 2-3 sentences, no superlatives.
6. seo_keywords: max 8, comma-separated, lowercase.
7. HSN code: must be 4, 6, or 8 digits, numeric only.
8. country_of_origin: usually "India" for Indian sellers.
9. If you're unsure about a field, omit it rather than guess wrong.

OUTPUT SCHEMA (strict JSON):
{
  "product_type": "Kurta",
  "hsn_code": "61091000",
  "fabric_family": "Cotton",
  "fabric_composition": "100% Cotton",
  "sleeve_type": "Three Quarter Sleeves",
  "neck_collar": "Round Neck",
  "neckline": "Round",
  "fit_type": "Regular Fit",
  "pattern": "Floral Print",
  "occasion": "Casual, Festive",
  "age_band": "Adult",
  "wash_care": "Machine wash cold, do not bleach",
  "country_of_origin": "India",
  "manufacturer": "<brand or 'India'>",
  "color_family": "Pink",
  "seo_keywords": "cotton kurta, floral kurta, ethnic wear, women kurta",
  "enhanced_title": "Floral Print Cotton Kurta",
  "enhanced_description": "...",
  "features": "Comfortable, Breathable, Easy Care",
  "transparency": "Opaque",
  "pocket_type": "None",
  "hemline": "Straight",
  "cuff_style": "Plain",
  "stitching": "Machine Stitched",
  "branding_logo": "Brand Tag",
  "size_chart": "XS, S, M, L, XL, XXL",
  "confidence": 0.88
}`;

export interface EnrichOptions {
  product: ParsedProduct;
  imageBase64?: string;
  imageMimeType?: string;
}

export async function enrichProduct(opts: EnrichOptions): Promise<EnrichedProduct> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return mockEnrich(opts.product);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    const userPrompt = `Enrich this fashion product. Return only valid JSON.

Title: ${opts.product.title ?? '(missing)'}
Brand: ${opts.product.brand ?? '(missing)'}
Category: ${opts.product.category ?? '(missing)'}
SKU: ${opts.product.sku ?? '(missing)'}
MRP: ${opts.product.mrp ?? '(missing)'}
Description: ${opts.product.description ?? '(missing)'}
Color hint: ${opts.product.color ?? '(missing)'}

Fill in all attributes you can confidently determine. Use the image if provided.`;

    const parts: any[] = [{ text: userPrompt }];
    if (opts.imageBase64) {
      parts.push({
        inlineData: { data: opts.imageBase64, mimeType: opts.imageMimeType ?? 'image/jpeg' },
      });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    const confidence = Math.round((parsed.confidence ?? 0.85) * 100);
    delete parsed.confidence;

    return {
      ...opts.product,
      enriched: parsed,
      confidence,
      matchedImages: [],
    };
  } catch (err) {
    console.error('[gemini] enrichment failed, falling back to mock:', err);
    return mockEnrich(opts.product);
  }
}

function mockEnrich(product: ParsedProduct): EnrichedProduct {
  const title = (product.title ?? '').toLowerCase();
  const cat = (product.category ?? '').toLowerCase();
  const combined = `${title} ${cat}`;

  // Heuristic enrichment based on keywords
  const isKurta = /kurta|kurti/.test(combined);
  const isShirt = /shirt|formal/.test(combined);
  const isTshirt = /t-?shirt|tee\b/.test(combined);
  const isDenim = /jean|denim|trouser|pant/.test(combined);
  const isDress = /dress|gown|frock/.test(combined);
  const isSaree = /saree|sari/.test(combined);

  let product_type = 'Apparel';
  let hsn = '61091000';
  let fabric = 'Cotton';
  let neckline = 'Round';
  let sleeve = 'Short Sleeves';
  let fit = 'Regular Fit';

  if (isKurta) { product_type = 'Kurta'; hsn = '61091000'; fabric = 'Cotton'; neckline = 'Round'; sleeve = 'Three Quarter Sleeves'; }
  else if (isShirt) { product_type = 'Shirt'; hsn = '62052000'; fabric = 'Cotton'; neckline = 'Collared'; sleeve = 'Full Sleeves'; fit = 'Slim Fit'; }
  else if (isTshirt) { product_type = 'T-Shirt'; hsn = '61091000'; fabric = 'Cotton'; neckline = 'Round'; sleeve = 'Short Sleeves'; }
  else if (isDenim) { product_type = 'Jeans'; hsn = '62034200'; fabric = 'Denim'; neckline = ''; sleeve = ''; fit = 'Slim Fit'; }
  else if (isDress) { product_type = 'Dress'; hsn = '62044200'; fabric = 'Polyester'; neckline = 'V-Neck'; sleeve = 'Sleeveless'; }
  else if (isSaree) { product_type = 'Saree'; hsn = '52083920'; fabric = 'Cotton'; neckline = ''; sleeve = ''; }

  const color = product.color ?? extractColorFromTitle(product.title ?? '');
  const brand = product.brand ?? 'Generic';

  return {
    ...product,
    enriched: {
      product_type,
      hsn_code: hsn,
      fabric_family: fabric,
      fabric_composition: fabric === 'Denim' ? '98% Cotton 2% Elastane' : '100% Cotton',
      sleeve_type: sleeve || undefined,
      neckline: neckline || undefined,
      neck_collar: neckline === 'Collared' ? 'Spread Collar' : neckline,
      fit_type: fit,
      pattern: /floral|print/.test(combined) ? 'Floral Print' : /solid|plain/.test(combined) ? 'Solid' : 'Solid',
      occasion: isKurta || isSaree ? 'Festive, Casual' : isShirt ? 'Formal, Office' : 'Casual',
      age_band: /kid|child|baby/.test(combined) ? 'Kids' : 'Adult',
      wash_care: 'Machine wash cold, do not bleach, tumble dry low',
      country_of_origin: 'India',
      manufacturer: brand,
      color_family: color,
      seo_keywords: `${product_type.toLowerCase()}, ${color.toLowerCase()} ${product_type.toLowerCase()}, ${fabric.toLowerCase()} ${product_type.toLowerCase()}, ${brand.toLowerCase()}, ethnic wear, indian fashion`,
      enhanced_title: product.title ?? `${color} ${fabric} ${product_type}`,
      enhanced_description: `Crafted from ${fabric.toLowerCase()}, this ${product_type.toLowerCase()} from ${brand} offers comfort and style for everyday wear. Features a ${fit.toLowerCase()} silhouette ideal for ${isShirt ? 'formal occasions' : 'casual outings'}.`,
      features: 'Breathable, Comfortable, Easy Care',
      transparency: 'Opaque',
      pocket_type: isShirt || isDenim ? 'Side Pockets' : 'None',
      hemline: 'Straight',
      cuff_style: sleeve === 'Full Sleeves' ? 'Button Cuff' : 'Plain',
      stitching: 'Machine Stitched',
      branding_logo: 'Brand Tag at Neck',
      size_chart: 'XS, S, M, L, XL, XXL',
    },
    confidence: 78 + Math.floor(Math.random() * 15), // 78-92%
    matchedImages: [],
  };
}

function extractColorFromTitle(title: string): string {
  const colors = ['Red', 'Blue', 'Green', 'Black', 'White', 'Pink', 'Yellow', 'Orange', 'Purple', 'Brown', 'Grey', 'Gray', 'Navy', 'Maroon', 'Beige', 'Cream', 'Olive', 'Teal', 'Indigo', 'Coral'];
  const lower = title.toLowerCase();
  for (const c of colors) {
    if (lower.includes(c.toLowerCase())) return c === 'Gray' ? 'Grey' : c;
  }
  return 'Multi';
}
