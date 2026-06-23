/**
 * Output Builder — generates a per-L4-split enriched XLSX workbook.
 *
 * Output structure (per explicit APM request, supersedes the earlier
 * unified-single-sheet structure):
 *   - ONE sheet per L4 category present in the upload, named after the L4
 *     ("Casual Dresses", "Tops And Tees", "Casual Shirts", etc.)
 *   - Each L4 sheet contains ONLY the columns that MDD says apply to that
 *     L4 — Casual Dresses gets Dress Shape & Dress Length; Skirts gets
 *     Skirt Shape & Skirt Length; Tops And Tees gets Tshirt Type; etc.
 *   - Common columns (sku_code, title, color, fabric, brand, weight, MRP,
 *     image references, descriptive copy, MDD administrative fields) appear
 *     on every L4 sheet at consistent positions for easy diff against
 *     the original golden sheet.
 *   - Plus three QA sheets: _QA (per-row confidence, tokens, cost),
 *     _FlaggedItems (audit trail of every Vision correction or flag), and
 *     _Compliance (per-row mandatory-fields-missing list).
 *
 * Per-L4 column subsets are derived from
 *   MDD_PCM_ETAIL_V1_9_Apparel.xlsx > Attribute_Mapping_Apparel
 * (every L4 row marks each PIM column with "Yes" if it applies).
 *
 * Per the rule of "fully enriched no matter what cells I remove": when a
 * mandatory field has no seller value AND no Vision input AND no inference
 * is possible, the cell is left blank ONLY in the data row but explicitly
 * marked in the _Compliance sheet so the reviewer immediately sees it.
 * Silent defaults ("Solid"/"Regular Fit"/etc.) are NOT written — those
 * caused the earlier accuracy regression by tripping conflict protection.
 */

import * as XLSX from 'xlsx';
import type { EnrichedRow } from './enrichment-engine';
import type { CategoryNode } from './mdd';
import type { ParsedProduct } from './excel';

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN SCHEMA — exact 94-column structure from golden_sheet_for_seller_portal.xlsx
// ─────────────────────────────────────────────────────────────────────────────

interface OutputColumn {
  /** Canonical attribute key in the enrichment engine */
  key: string;
  /** Human display name shown in row 3 (0-indexed) */
  displayName: string;
  /** PIM attribute code shown in row 4 (e.g., #ATTR_colorapparel_Color) */
  attrCode: string;
  /** Data type indicator shown in row 0 — exact strings from the real file */
  type: 'String' | 'INTEGER' | 'ENUM' | 'STRING' | 'Decimal(0.00)' | 'Decimal(0.000)' | 'Date(dd-MM-yyyy)';
  /** Whether the golden sheet's own header row marks this MANDATORY */
  mandatory: boolean;
  /** Max length (for the limit row) */
  maxLength: number;
}

const GOLDEN_SCHEMA: OutputColumn[] = [
  { key: 'product_upload_status', displayName: 'S_OR_D', attrCode: 'PRODUCTUPLOADSTATUS*', type: 'String', mandatory: true, maxLength: 1 },
  { key: 'hsn_code', displayName: 'HSN CODE', attrCode: 'HSNCODE*', type: 'String', mandatory: true, maxLength: 15 },
  { key: 'sku_code', displayName: 'Seller Article SKU', attrCode: 'SKUCODE*', type: 'String', mandatory: true, maxLength: 30 },
  { key: 'title', displayName: 'PRODUCT TITLE', attrCode: 'TITLE*', type: 'String', mandatory: true, maxLength: 100 },
  { key: 'name', displayName: 'PRODUCT NAME', attrCode: 'NAME*', type: 'String', mandatory: true, maxLength: 200 },
  { key: 'description', displayName: 'PRODUCT DESCRIPTION', attrCode: 'DESCRIPTION*', type: 'String', mandatory: true, maxLength: 600 },
  { key: 'mini_description', displayName: 'PRODUCT MINIDESCRIPTION', attrCode: 'MINIDESCRIPTION', type: 'String', mandatory: false, maxLength: 150 },
  { key: 'meta_title', displayName: 'PRODUCT METATITLE', attrCode: 'METATITLE', type: 'String', mandatory: false, maxLength: 100 },
  { key: 'meta_keyword', displayName: 'PRODUCT METAKEYWORD', attrCode: 'METAKEYWORD', type: 'String', mandatory: false, maxLength: 100 },
  { key: 'meta_description', displayName: 'PRODUCT METADESCRIPTION', attrCode: 'METADESCRIPTION', type: 'String', mandatory: false, maxLength: 200 },
  { key: 'tags', displayName: 'PRODUCT TAGS', attrCode: 'TAGS', type: 'String', mandatory: false, maxLength: 100 },
  { key: 'pbi_identity_code', displayName: 'GLOBAL_IDENTIFIER_TYPE', attrCode: 'PBIIDENTITYCODE', type: 'String', mandatory: false, maxLength: 50 },
  { key: 'pbi_identity_value', displayName: 'GLOBAL_IDENTIFIER_VALUE', attrCode: 'PBIIDENTITYVALUE', type: 'INTEGER', mandatory: false, maxLength: 50 },
  { key: '_blank_id2_type', displayName: 'GLOBAL_IDENTIFIER_TYPE_2', attrCode: 'PBIIDENTITYCODE_2', type: 'String', mandatory: false, maxLength: 50 },
  { key: '_blank_id2_val', displayName: 'GLOBAL_IDENTIFIER_VALUE_2', attrCode: 'PBIIDENTITYVALUE_2', type: 'INTEGER', mandatory: false, maxLength: 50 },
  { key: '_blank_id3_type', displayName: 'GLOBAL_IDENTIFIER_TYPE_3', attrCode: 'PBIIDENTITYCODE_3', type: 'String', mandatory: false, maxLength: 50 },
  { key: '_blank_id3_val', displayName: 'GLOBAL_IDENTIFIER_VALUE_3', attrCode: 'PBIIDENTITYVALUE_3', type: 'INTEGER', mandatory: false, maxLength: 50 },
  { key: 'startdate', displayName: 'PRODUCT STARTDATE', attrCode: 'STARTDATE*', type: 'Date(dd-MM-yyyy)', mandatory: true, maxLength: 31 },
  { key: 'enddate', displayName: 'PRODUCT ENDDATE', attrCode: 'ENDDATE', type: 'Date(dd-MM-yyyy)', mandatory: false, maxLength: 31 },
  { key: 'review', displayName: 'PRODUCT REVIEW', attrCode: 'REVIEW', type: 'String', mandatory: false, maxLength: 255 },
  { key: 'product_images', displayName: 'PRODUCT IMAGES', attrCode: 'PITIMAGE*', type: 'String', mandatory: true, maxLength: 200 },
  { key: 'image_priority', displayName: 'IMAGE PRIORITY', attrCode: 'IMAGEPRIORITY', type: 'INTEGER', mandatory: false, maxLength: 3 },
  { key: 'video_url', displayName: 'PRODUCT VIDEO URL', attrCode: 'VIDEOURL', type: 'String', mandatory: false, maxLength: 200 },
  { key: 'country_of_manufacturer', displayName: 'COUNTRY OF MANUFACTURER', attrCode: 'COUNTRYOFMANUFACTURER', type: 'String', mandatory: false, maxLength: 50 },
  { key: 'length', displayName: 'PRODUCT LENGTH [cm]', attrCode: 'LENGTH', type: 'Decimal(0.00)', mandatory: false, maxLength: 10 },
  { key: 'width', displayName: 'PRODUCT WIDTH [cm]', attrCode: 'WIDTH', type: 'Decimal(0.00)', mandatory: false, maxLength: 10 },
  { key: 'height', displayName: 'PRODUCT HEIGHT [cm]', attrCode: 'HEIGHT', type: 'Decimal(0.00)', mandatory: false, maxLength: 10 },
  { key: 'weight', displayName: 'PRODUCT WEIGHT [gm]', attrCode: 'WEIGHT*', type: 'Decimal(0.000)', mandatory: true, maxLength: 10 },
  { key: 'up_sell_associated_products', displayName: 'Up Sell - Associated Products', attrCode: '#ATTR_upSellAssociatedProducts_Up Sell - Associated Products', type: 'STRING', mandatory: false, maxLength: 255 },
  { key: 'fabric_family', displayName: 'Fabric Family (Refer LOV List)', attrCode: '#ATTR_womenfabric_Fabric Family*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'generic_name', displayName: 'Generic Name', attrCode: '#ATTR_genericName_Generic Name*', type: 'STRING', mandatory: true, maxLength: 50 },
  { key: 'style_note', displayName: 'Style Note', attrCode: '#ATTR_stylenote_Style Note*', type: 'STRING', mandatory: true, maxLength: 600 },
  { key: 'sleeve', displayName: 'Sleeve ', attrCode: '#ATTR_womencasualtopwearsleeve_Sleeve*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'cross_sell_status', displayName: 'Cross Sell - Associated Product Status (Refer LOV List)', attrCode: '#ATTR_crossSellAssociatedProductStatus_Cross Sell - Associated Product Status', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'age_band', displayName: 'Age Band (Refer LOV List)', attrCode: '#ATTR_ageband_Age Band*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'color', displayName: 'Color', attrCode: '#ATTR_colorapparel_Color*', type: 'STRING', mandatory: true, maxLength: 100 },
  { key: 'freebie', displayName: 'Freebie (Refer LOV List)', attrCode: '#ATTR_freebie_Freebie', type: 'STRING', mandatory: false, maxLength: 20 },
  { key: 'brand_description', displayName: 'Brand Description', attrCode: '#ATTR_brandDescription_Brand Description*', type: 'STRING', mandatory: true, maxLength: 255 },
  { key: 'fit', displayName: 'Fit ( must fill this)', attrCode: '#ATTR_womentopwearfit_Fit*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'color_group', displayName: 'Color Group (Refer LOV List)', attrCode: '#ATTR_colorgroupapparel_Color Group', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'feature', displayName: 'Feature', attrCode: '#ATTR_featureapparel_Feature', type: 'STRING', mandatory: false, maxLength: 50 },
  { key: 'brand', displayName: 'Brand (Refer LOV List)', attrCode: '#ATTR_brand_Brand*', type: 'ENUM', mandatory: true, maxLength: 40 },
  { key: 'gst_eligible', displayName: 'GST Eligible', attrCode: '#ATTR_gstEligible_GST Eligible', type: 'STRING', mandatory: false, maxLength: 20 },
  { key: 'weight_apparel', displayName: 'Weight', attrCode: '#ATTR_weightapparel_Weight*', type: 'STRING', mandatory: true, maxLength: 10 },
  { key: 'seller_association_status', displayName: 'Seller Product Association Status (Refer LOV List)', attrCode: '#ATTR_sellerAssociationStatus_Seller Product Association Status*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'additional_details_1', displayName: 'Additional Details 1', attrCode: '#ATTR_additionaldetails1apparel_Additional Details 1', type: 'STRING', mandatory: false, maxLength: 100 },
  { key: 'additional_details_3', displayName: 'Additional Details 3', attrCode: '#ATTR_additionaldetails3apparel_Additional Details 3', type: 'STRING', mandatory: false, maxLength: 100 },
  { key: 'tags_internal', displayName: 'Tags', attrCode: '#ATTR_tags_Tags', type: 'STRING', mandatory: false, maxLength: 4000 },
  { key: 'key_trends', displayName: 'Key Trends (Refer LOV List)', attrCode: '#ATTR_keytrendsapparel_Key Trends', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'up_sell_associated_product_status', displayName: 'Up Sell - Associated Product Status (Refer LOV List)', attrCode: '#ATTR_upSellAssociatedProductStatus_Up Sell - Associated Product Status', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'tshirt_type', displayName: 'Tshirt Type (Refer LOV List)', attrCode: '#ATTR_tshirttype_Tshirt Type', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'size_chart', displayName: 'Size Chart', attrCode: '#ATTR_sizechart_Size Chart*', type: 'STRING', mandatory: true, maxLength: 255 },
  { key: 'warranty_type', displayName: 'Warranty Type (Refer LOV List)', attrCode: '#ATTR_warrantyType_Warranty Type*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'lead_time', displayName: 'Lead time for the SKU - Home Delivery [No. of Minute]', attrCode: '#ATTR_leadTimeForTheSKUHomeDelivery_Lead time for the SKU - Home Delivery [No. of Minute]*', type: 'INTEGER', mandatory: true, maxLength: 5 },
  { key: 'wash_care', displayName: 'Wash', attrCode: '#ATTR_washcare_Wash*', type: 'STRING', mandatory: true, maxLength: 50 },
  { key: 'neck_collar', displayName: 'Neck/Collar (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearneckcollar_Neck/Collar*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'style_code', displayName: 'Style Code', attrCode: '#ATTR_stylecode_Style Code*', type: 'STRING', mandatory: true, maxLength: 50 },
  { key: 'occasion', displayName: 'Occasion (Refer LOV List)', attrCode: '#ATTR_occasion_Occasion*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'unisex', displayName: 'Unisex (Refer LOV List)', attrCode: '#ATTR_unisexapparel_Unisex', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'manufacturers_details', displayName: 'Manufacturer\'s Details', attrCode: '#ATTR_manufacturersDetails_Manufacturer\'s Details*', type: 'STRING', mandatory: true, maxLength: 4000 },
  { key: 'gender', displayName: 'Gender (Refer LOV List)', attrCode: '#ATTR_gender_Gender', type: 'STRING', mandatory: false, maxLength: 20 },
  { key: 'cross_sell_associated_products', displayName: 'Cross Sell - Associated Products', attrCode: '#ATTR_crossSellAssociatedProducts_Cross Sell - Associated Products', type: 'STRING', mandatory: false, maxLength: 255 },
  { key: 'sleeve_styling', displayName: 'Sleeve Styling (Refer LOV List)', attrCode: '#ATTR_sleevestylingapparel_Sleeve Styling', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'multi_pack', displayName: 'Multi Pack (Refer LOV List)', attrCode: '#ATTR_multipack_Multi Pack*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'lead_variant_id', displayName: 'Lead Variant ID', attrCode: '#ATTR_leadvariantid_Lead Variant ID', type: 'STRING', mandatory: false, maxLength: 30 },
  { key: 'net_quantity', displayName: 'Net Quantity', attrCode: '#ATTR_netQuantity_Net Quantity*', type: 'STRING', mandatory: true, maxLength: 255 },
  { key: 'display_product_name', displayName: 'Display Product Name', attrCode: '#ATTR_displayproduct_Display Product Name*', type: 'STRING', mandatory: true, maxLength: 40 },
  { key: 'platform', displayName: 'Platform (Refer LOV List)', attrCode: '#ATTR_platform_Platform*', type: 'STRING', mandatory: true, maxLength: 100 },
  { key: 'season', displayName: 'Season (Refer LOV List)', attrCode: '#ATTR_seasonapparel_Season', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'pattern', displayName: 'Pattern (Refer LOV List)', attrCode: '#ATTR_womenpattern_Pattern', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'model_fit', displayName: 'Model Fit', attrCode: '#ATTR_modelfit_Model Fit*', type: 'STRING', mandatory: true, maxLength: 150 },
  { key: 'color_family', displayName: 'Color Family (Refer LOV List)', attrCode: '#ATTR_colorfamilyapparel_Color Family*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'business_tag', displayName: 'Business Tag (Refer LOV List)', attrCode: '#ATTR_businesstag_Business Tag', type: 'STRING', mandatory: false, maxLength: 500 },
  { key: 'additional_details_2', displayName: 'Additional Details 2', attrCode: '#ATTR_additionaldetails2apparel_Additional Details 2', type: 'STRING', mandatory: false, maxLength: 100 },
  { key: 'importers_details', displayName: 'Importer\'s Details', attrCode: '#ATTR_importersDetails_Importer\'s Details*', type: 'STRING', mandatory: true, maxLength: 4000 },
  { key: 'pack_color', displayName: 'Pack Color (Refer LOV List)', attrCode: '#ATTR_packcolor_Pack Color', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'dangerous_goods', displayName: 'Dangerous Goods', attrCode: '#ATTR_dangerousGoods_Dangerous Goods', type: 'STRING', mandatory: false, maxLength: 20 },
  { key: 'warranty_period', displayName: 'Warranty Time Period [Months]', attrCode: '#ATTR_warrantyTimePeriod_Warranty Time Period [Months]*', type: 'STRING', mandatory: true, maxLength: 5 },
  { key: 'mrp', displayName: 'MRP [INR]', attrCode: '#ATTR_mrp_MRP [INR]*', type: 'INTEGER', mandatory: true, maxLength: 10 },
  { key: 'fabric', displayName: 'Fabric', attrCode: '#ATTR_fabricapparel_Fabric*', type: 'STRING', mandatory: true, maxLength: 300 },
  { key: 'pack_quantity', displayName: 'Pack Quantity', attrCode: '#ATTR_packquantity_Pack Quantity', type: 'STRING', mandatory: false, maxLength: 5 },
  { key: 'packers_details', displayName: 'Packer\'s Details', attrCode: '#ATTR_packersDetails_Packer\'s Details*', type: 'STRING', mandatory: true, maxLength: 4000 },
  { key: 'size', displayName: 'Size (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearsize_Size*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'country_of_origin', displayName: 'Country of Origin', attrCode: '#ATTR_countryOfOrigin_Country of Origin*', type: 'STRING', mandatory: true, maxLength: 200 },
  { key: 'story_name', displayName: 'Story Name', attrCode: '#ATTR_storyname_Story Name', type: 'STRING', mandatory: false, maxLength: 50 },
  { key: 'dress_length', displayName: 'Dress Length (Refer LOV List)', attrCode: '#ATTR_dresslength_Dress Length*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'dress_shape', displayName: 'Dress Shape (Refer LOV List)', attrCode: '#ATTR_dressshape_Dress Shape*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'image_1', displayName: 'Image_1', attrCode: 'Image_1', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_2', displayName: 'Image_2', attrCode: 'Image_2', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_3', displayName: 'Image_3', attrCode: 'Image_3', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_4', displayName: 'Image_4', attrCode: 'Image_4', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_5', displayName: 'Image_5', attrCode: 'Image_5', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_6', displayName: 'Image_6', attrCode: 'Image_6', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_7', displayName: 'Image_7', attrCode: 'Image_7', type: 'STRING', mandatory: false, maxLength: 0 },
];

/**
 * Per-L4 applicability map — derived from MDD_PCM_ETAIL_V1_9_Apparel.xlsx
 * `Attribute_Mapping_Apparel` sheet. Every PIM code listed against an L4
 * marks an attribute as applicable to that L4.
 *
 * Keys are GOLDEN_SCHEMA `key` values; values are the set of L4s where
 * that key is meaningful. Keys NOT listed here apply to every L4 (the
 * common set: identifiers, copy, color, fabric, brand, MRP, weight,
 * admin/compliance fields, image columns).
 */
const PER_L4_ONLY: Record<string, Set<string>> = {
  // ── Dress-specific ────────────────────────────────────────────────────
  dress_shape: new Set(['Casual dresses']),
  dress_length: new Set(['Casual dresses']),
  // ── Tops-and-tees-specific ────────────────────────────────────────────
  tshirt_type: new Set(['Tops and tees']),
  // ── Skirt-specific (added defensively for future expansion) ──────────
  // (skirt_shape / skirt_length only emit if the engine ever produces them)
  // ── Top + dress + shirt: neck/sleeve/fit/pattern apply broadly across
  //    Women's Western Wear top-half garments, so they stay in the common
  //    set rather than being scoped per L4. Skirts/Jeans would EXCLUDE
  //    these — when those L4s are added, list keys here:
  //    neck_collar: new Set(['Tops and tees','casual shirts','Casual dresses','Kurta & kurtis']),
  //    sleeve:      new Set(['Tops and tees','casual shirts','Casual dresses','Kurta & kurtis']),
};

/**
 * Get the column set that applies to a given L4. Includes:
 *   - every column not listed in PER_L4_ONLY (the common set)
 *   - plus any L4-specific columns whose set includes this L4
 */
function getSchemaForCategory(cat: CategoryNode): OutputColumn[] {
  const l4 = cat.l4;
  return GOLDEN_SCHEMA.filter((col) => {
    const specificTo = PER_L4_ONLY[col.key];
    if (!specificTo) return true;
    return specificTo.has(l4);
  });
}

/**
 * Sanitize a category name for use as an Excel sheet name.
 * Excel sheet names: max 31 chars, no \\ / ? * [ ] characters.
 */
function sanitizeSheetName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31).trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// BUILD XLSX
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildOutputOptions {
  /** Include a "_QA" sheet with confidence scores and validation flags */
  includeQASheet?: boolean;
  /** Include a "_MDD_Compliance" sheet listing per-row missing mandatory fields */
  includeComplianceSheet?: boolean;
  /** Include a "_FlaggedItems" audit-trail sheet — every Vision correction or
   *  flagged suggestion, with original value, corrected value, confidence,
   *  and reason. Defaults to true: this is the audit trail the business
   *  rule explicitly requires for "complete transparency," not an opt-in. */
  includeFlaggedItemsSheet?: boolean;
  /** Original seller-uploaded rows. When provided, an "_Inputs" sheet
   *  is added showing the raw seller data so the reviewer can do a
   *  side-by-side diff against the enriched L4 sheets. */
  originalInputs?: ParsedProduct[];
}

export function buildEnrichmentWorkbook(
  enriched: EnrichedRow[],
  opts: BuildOutputOptions = {},
): Buffer {
  const wb = XLSX.utils.book_new();

  // Split rows by L4 category and emit one sheet per L4.
  // Preserves the seller's original row order WITHIN each L4 sheet.
  const byL4 = new Map<string, EnrichedRow[]>();
  for (const r of enriched) {
    const key = r.category.l4;
    if (!byL4.has(key)) byL4.set(key, []);
    byL4.get(key)!.push(r);
  }

  // Sort L4s by descending row count so the largest category appears first
  // (matches how a reviewer typically wants to scan: biggest first).
  const sortedL4s = Array.from(byL4.entries()).sort((a, b) => b[1].length - a[1].length);

  for (const [, rows] of sortedL4s) {
    if (rows.length === 0) continue;
    const cat = rows[0].category;
    const schema = getSchemaForCategory(cat);
    const sheet = buildCategorySheet(rows, schema);
    const sheetName = sanitizeSheetName(cat.displayName || cat.l4);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  // Always include the audit/QA sheets — these are the reviewer's
  // tools, not optional add-ons. Per-row tokens and cost live in _QA;
  // per-row mandatory-field gaps live in _Compliance; every Vision
  // correction/flag is recorded in _FlaggedItems for audit trail.
  if (opts.includeQASheet !== false) {
    XLSX.utils.book_append_sheet(wb, buildQASheet(enriched), '_QA');
  }
  if (opts.includeComplianceSheet !== false) {
    XLSX.utils.book_append_sheet(wb, buildComplianceSheet(enriched), '_Compliance');
  }
  if (opts.includeFlaggedItemsSheet !== false) {
    XLSX.utils.book_append_sheet(wb, buildFlaggedItemsSheet(enriched), '_FlaggedItems');
  }
  // _Inputs sheet — raw seller data for side-by-side comparison with the
  // enriched L4 sheets. Useful when the reviewer wants to spot-check what
  // values came from the seller vs what was enriched/inferred/corrected.
  if (opts.originalInputs && opts.originalInputs.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildInputsSheet(opts.originalInputs), '_Inputs');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildInputsSheet(inputs: ParsedProduct[]): XLSX.WorkSheet {
  // Collect all keys across all rows so column order is stable and complete.
  // SKU first, then the rest alphabetically — most reviewers scan by SKU.
  const allKeys = new Set<string>();
  for (const p of inputs) for (const k of Object.keys(p.raw)) allKeys.add(k);
  const cols = ['SKU', ...Array.from(allKeys).sort()];
  const aoa: any[][] = [cols];
  for (const p of inputs) {
    aoa.push(cols.map((c) => {
      if (c === 'SKU') return p.sku ?? '';
      const v = p.raw[c];
      return v === undefined || v === null ? '' : v;
    }));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = cols.map(() => ({ wch: 22 }));
  return sheet;
}

function buildCategorySheet(rows: EnrichedRow[], schema: OutputColumn[]): XLSX.WorkSheet {
  const aoa: any[][] = [];

  // Three trailing meta columns appear AFTER every L4 sheet's data columns
  // so the reviewer can see at-a-glance which rows had Vision corrections,
  // what the per-row Gemini cost was, and which mandatory fields still
  // need filling. These aren't part of MDD; they're traceability columns
  // for the dashboard.
  const META_HEADERS = ['_NEEDS_REVIEW', '_VISION_CONFLICTS', '_COST_USD'];

  // Row 0: type indicators
  aoa.push([...schema.map((c) => c.type), 'String', 'String', 'Decimal(0.000)']);
  // Row 1: mandatory flags
  aoa.push([...schema.map((c) => (c.mandatory ? 'MANDATORY' : 'NON-MANDATORY')),
    'NON-MANDATORY', 'NON-MANDATORY', 'NON-MANDATORY']);
  // Row 2: max length numbers
  aoa.push([...schema.map((c) => c.maxLength), 0, 0, 0]);
  // Row 3: display names
  aoa.push([...schema.map((c) => c.displayName), ...META_HEADERS]);
  // Row 4: attribute codes
  aoa.push([...schema.map((c) => c.attrCode), ...META_HEADERS]);

  // Data rows
  for (const r of rows) {
    const dataCells = schema.map((c) => {
      const val = r.attrs[c.key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
      // For mandatory fields with no value, mark the cell so a reviewer
      // sees the gap immediately rather than the cell looking complete.
      // For non-mandatory blank fields, leave blank — they're optional
      // and a [NEEDS REVIEW] marker would be noise, not signal.
      return c.mandatory ? '[NEEDS REVIEW]' : '';
    });
    // Meta cells:
    //   _NEEDS_REVIEW    — comma-joined list of missing mandatory keys
    //                      that apply to this L4 (filtered by schema)
    //   _VISION_CONFLICTS — comma-joined list of conflict field names
    //   _COST_USD        — per-row cost from Vision tokens
    const schemaKeys = new Set(schema.map((c) => c.key));
    const needsReview = r.missingMandatory.filter((k) => schemaKeys.has(k)).join(', ');
    const conflicts = r.visionConflicts
      .map((s) => s.split(':')[0])
      .filter((k, i, a) => a.indexOf(k) === i)
      .join(', ');
    const cost = r.costUsd !== undefined ? Number(r.costUsd.toFixed(6)) : '';
    aoa.push([...dataCells, needsReview, conflicts, cost]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [...schema.map(() => ({ wch: 22 })), { wch: 28 }, { wch: 28 }, { wch: 12 }];
  return sheet;
}

function buildQASheet(enriched: EnrichedRow[]): XLSX.WorkSheet {
  const header = [
    'SKU', 'Style Code', 'Category L4', 'Classification Confidence', 'Classification Reason',
    'Overall Confidence', 'Confidence Tier',
    'High-Confidence Fields', 'Medium-Confidence Fields', 'Low-Confidence Fields (review before upload)',
    'Vision Enriched', 'Vision Conflicts (image vs seller — review)',
    'Mandatory Fields Missing', 'Lead Variant', 'Family Size',
    'Tokens In', 'Tokens Out', 'Cost (USD)',
  ];
  const aoa: any[][] = [header];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;
  for (const r of enriched) {
    const high: string[] = [];
    const medium: string[] = [];
    const low: string[] = [];
    for (const [field, conf] of Object.entries(r.confidence)) {
      // Skip the synthetic __overall key — it's a bookkeeping
      // entry the Vision module uses as a fallback, not a real catalog
      // attribute. Listing it under high/medium/low would just confuse
      // the reviewer.
      if (field === '__overall') continue;
      // Matches mergeAttribute's confidenceTier(): >0.80 high, 0.70-0.80 medium, <0.70 low.
      if (conf > 0.80) high.push(field);
      else if (conf >= 0.70) medium.push(field);
      else low.push(field);
    }
    if (r.tokensIn) totalTokensIn += r.tokensIn;
    if (r.tokensOut) totalTokensOut += r.tokensOut;
    if (r.costUsd) totalCostUsd += r.costUsd;
    aoa.push([
      r.sku,
      r.styleCode,
      r.category.l4,
      r.classificationConfidence.toFixed(2),
      r.classificationReason,
      r.overallConfidence.toFixed(2),
      r.overallConfidence > 0.80 ? 'HIGH' : r.overallConfidence >= 0.70 ? 'MEDIUM' : 'LOW',
      high.join(', '),
      medium.join(', '),
      low.join(', '),
      r.visionEnriched ? 'Yes' : 'No',
      r.visionConflicts.join(' | '),
      r.missingMandatory.join(', '),
      r.leadVariantId || '(this is lead)',
      r.styleFamily.length,
      r.tokensIn ?? (r.leadVariantId ? `(inherited from lead ${r.leadVariantId})` : ''),
      r.tokensOut ?? '',
      r.costUsd !== undefined ? r.costUsd.toFixed(6) : '',
    ]);
  }
  // Totals row — real cost across the whole upload, summed only from lead
  // rows (variants don't carry their own duplicate token counts).
  aoa.push([
    'TOTAL', '', '', '', '', '', '', '', '', '', '', '', '',
    `${enriched.filter((r) => r.tokensIn !== undefined).length} API calls`,
    '',
    totalTokensIn, totalTokensOut, totalCostUsd.toFixed(6),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 40 }, { wch: 12 }, { wch: 14 },
    { wch: 35 }, { wch: 35 }, { wch: 35 },
    { wch: 12 }, { wch: 45 },
    { wch: 30 }, { wch: 20 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];
  return sheet;
}

/**
 * Audit trail: one row per attribute Vision flagged or corrected, across the
 * whole upload. Per the explicit business rule, this must include BOTH
 * auto-applied corrections (>80% confidence conflict overrides) and
 * manual-review-only flags (everything else) — "even when an automatic
 * correction is made, the attribute must still be included ... along with
 * original value, corrected value, confidence score, reason."
 */
function buildFlaggedItemsSheet(enriched: EnrichedRow[]): XLSX.WorkSheet {
  const header = [
    'SKU', 'Field', 'Original (Seller) Value', 'Corrected/Suggested Value',
    'Confidence', 'Auto-Corrected?', 'Reason',
  ];
  const aoa: any[][] = [header];
  for (const r of enriched) {
    for (const item of r.flaggedItems) {
      aoa.push([
        r.sku,
        item.field,
        item.originalValue,
        item.correctedValue,
        item.confidence.toFixed(2),
        item.autoCorrected ? 'Yes' : 'No — needs manual review',
        item.reason,
      ]);
    }
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 28 },
    { wch: 12 }, { wch: 22 }, { wch: 70 },
  ];
  return sheet;
}

function buildComplianceSheet(enriched: EnrichedRow[]): XLSX.WorkSheet {
  const header = ['SKU', 'Title', 'Category', 'Missing Mandatory Attributes', 'Action Needed'];
  const aoa: any[][] = [header];
  for (const r of enriched.filter((e) => e.missingMandatory.length > 0)) {
    aoa.push([
      r.sku,
      r.attrs.title ?? '',
      r.category.l4,
      r.missingMandatory.join(', '),
      'Review and fill missing fields before upload',
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [{ wch: 20 }, { wch: 60 }, { wch: 25 }, { wch: 50 }, { wch: 50 }];
  return sheet;
}
