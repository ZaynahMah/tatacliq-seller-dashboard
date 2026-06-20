/**
 * Output Builder — generates a single unified Golden-Sheet-format XLSX.
 *
 * As of the structural reconciliation against the real uploaded files:
 *   - golden_sheet_for_seller_portal.xlsx is ONE sheet, 94 columns, used for
 *     ALL apparel L4 categories (dresses, tops, shirts) with the SAME column
 *     set — there is no per-category column split. Sleeve/Neck-Collar/Size
 *     use the generic "topwear"-coded PIM attributes even for dress rows;
 *     there is no separate Dress Shape column in the accepted format.
 *   - Tshirt Type and Dress Length both exist as columns regardless of
 *     category — blank for rows where they don't apply.
 *   - Image_1..Image_7 are the seller's ORIGINAL source image URLs
 *     (e.g. Shopify CDN), kept alongside PRODUCT IMAGES (the Tata-CLiQ
 *     renamed-filename reference) for traceability. These are also exactly
 *     what vision-enrichment.ts's extractImageUrls() downloads from.
 *   - MDD_PCM_ETAIL_V1_9_Apparel.xlsx (official spec, v1.9, 2016-2018) is the
 *     BASE for category structure and which attributes are mandatory, but
 *     its exact LOV value strings are stale — see the authority-hierarchy
 *     comment on LOV in mdd.ts. The golden sheet's structure wins here.
 *
 * This builder:
 *   1. Writes ONE sheet ("golden sheet for seller portal") with all rows
 *   2. Writes the 5 real header rows: type, mandatory flag, max length,
 *      display labels, attribute codes — verbatim from the accepted file
 *   3. Writes one data row per enriched product
 */

import * as XLSX from 'xlsx';
import type { EnrichedRow } from './enrichment-engine';
import type { CategoryNode } from './mdd';

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
  { key: 'image_1', displayName: 'Image_1', attrCode: 'Image_1', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_2', displayName: 'Image_2', attrCode: 'Image_2', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_3', displayName: 'Image_3', attrCode: 'Image_3', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_4', displayName: 'Image_4', attrCode: 'Image_4', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_5', displayName: 'Image_5', attrCode: 'Image_5', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_6', displayName: 'Image_6', attrCode: 'Image_6', type: 'STRING', mandatory: false, maxLength: 0 },
  { key: 'image_7', displayName: 'Image_7', attrCode: 'Image_7', type: 'STRING', mandatory: false, maxLength: 0 },
];

/**
 * Every category uses the same unified schema — see file header comment.
 * Kept as a function (rather than exporting GOLDEN_SCHEMA directly) so any
 * future genuinely-different category (e.g. Watches, a different L1) has an
 * obvious extension point without touching call sites.
 */
function getSchemaForCategory(_cat: CategoryNode): OutputColumn[] {
  return GOLDEN_SCHEMA;
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
}

export function buildEnrichmentWorkbook(
  enriched: EnrichedRow[],
  opts: BuildOutputOptions = {},
): Buffer {
  const wb = XLSX.utils.book_new();

  // ONE combined sheet, matching golden_sheet_for_seller_portal.xlsx exactly
  // — all categories share the same 94-column structure, so there is no
  // reason to split by L4 category the way an earlier version of this
  // builder did. Sheet name matches the real file's own sheet name (30
  // chars, fits Excel's 31-char limit) so a diff against the real golden
  // sheet lines up cleanly.
  if (enriched.length > 0) {
    const schema = getSchemaForCategory(enriched[0].category);
    const sheet = buildCategorySheet(enriched, schema);
    XLSX.utils.book_append_sheet(wb, sheet, 'golden sheet for seller portal');
  }

  if (opts.includeQASheet) {
    XLSX.utils.book_append_sheet(wb, buildQASheet(enriched), '_QA');
  }
  if (opts.includeComplianceSheet) {
    XLSX.utils.book_append_sheet(wb, buildComplianceSheet(enriched), '_Compliance');
  }
  if (opts.includeFlaggedItemsSheet !== false) {
    XLSX.utils.book_append_sheet(wb, buildFlaggedItemsSheet(enriched), '_FlaggedItems');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildCategorySheet(rows: EnrichedRow[], schema: OutputColumn[]): XLSX.WorkSheet {
  const aoa: any[][] = [];

  // Row 0: type indicators ("String", "INTEGER", "ENUM", etc.)
  aoa.push(schema.map((c) => c.type));
  // Row 1: mandatory flags
  aoa.push(schema.map((c) => (c.mandatory ? 'MANDATORY' : 'NON-MANDATORY')));
  // Row 2: max length numbers
  aoa.push(schema.map((c) => c.maxLength));
  // Row 3: display names (human-readable headers)
  aoa.push(schema.map((c) => c.displayName));
  // Row 4: attribute codes (#ATTR_xxx_Xxx form)
  aoa.push(schema.map((c) => c.attrCode));

  // Data rows
  for (const r of rows) {
    const row = schema.map((c) => r.attrs[c.key] ?? '');
    aoa.push(row);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Reasonable column widths
  sheet['!cols'] = schema.map(() => ({ wch: 22 }));
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
