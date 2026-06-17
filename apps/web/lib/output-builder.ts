/**
 * Output Builder — generates MDD-compliant XLSX matching Catalogus.ai output format.
 *
 * Critical observation from the reference Catalogus output files:
 *   - The output template's COLUMN SET differs per L4 category
 *   - Dress sheets have Dress Shape, Dress Length, women dress neck/sleeve columns
 *   - Top sheets have Tshirt Type, women top neck/sleeve columns
 *   - Mandatory/Non-Mandatory flag row appears below the type row
 *   - Display labels (e.g., "PRODUCTUPLOADSTATUS*") appear in a header row
 *
 * This builder:
 *   1. Groups enriched rows by L4 category
 *   2. For each category, generates a sheet with the EXACT MDD column set
 *   3. Writes 4 header rows: type, mandatory flag, display labels, attribute keys
 *   4. Writes one data row per enriched product
 */

import * as XLSX from 'xlsx';
import type { EnrichedRow } from './enrichment-engine';
import type { CategoryNode } from './mdd';

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN SCHEMAS — derived from the Catalogus output files we analyzed
// ─────────────────────────────────────────────────────────────────────────────

interface OutputColumn {
  /** Canonical attribute key in the enrichment engine */
  key: string;
  /** Human display name shown in row 1 */
  displayName: string;
  /** PIM attribute code shown in row 4 (e.g., #ATTR_colorapparel_Color) */
  attrCode: string;
  /** Data type indicator shown in row 0 */
  type: 'String' | 'INTEGER' | 'ENUM' | 'Decimal' | 'Date(dd-MM-yyyy)' | 'STRING';
  /** Whether MDD lists this as mandatory */
  mandatory: boolean;
  /** Max length (for the limit row) */
  maxLength: number;
}

/**
 * Column set shared by all L4 categories — the "common header" prefix.
 * Order matches Catalogus.ai reference output exactly.
 */
const COMMON_COLUMNS: OutputColumn[] = [
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
  { key: 'length', displayName: 'PRODUCT LENGTH [cm]', attrCode: 'LENGTH', type: 'Decimal', mandatory: false, maxLength: 10 },
  { key: 'width', displayName: 'PRODUCT WIDTH [cm]', attrCode: 'WIDTH', type: 'Decimal', mandatory: false, maxLength: 10 },
  { key: 'height', displayName: 'PRODUCT HEIGHT [cm]', attrCode: 'HEIGHT', type: 'Decimal', mandatory: false, maxLength: 10 },
  { key: 'weight', displayName: 'PRODUCT WEIGHT [gm]', attrCode: 'WEIGHT*', type: 'Decimal', mandatory: true, maxLength: 10 },
  { key: 'up_sell_associated_products', displayName: 'Up Sell - Associated Products', attrCode: '#ATTR_upSellAssociatedProducts_Up Sell - Associated Products', type: 'STRING', mandatory: false, maxLength: 255 },
];

const TRAIL_COMMON: OutputColumn[] = [
  { key: 'fabric_family', displayName: 'Fabric Family (Refer LOV List)', attrCode: '#ATTR_womenfabric_Fabric Family*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'generic_name', displayName: 'Generic Name', attrCode: '#ATTR_genericName_Generic Name*', type: 'STRING', mandatory: true, maxLength: 50 },
  { key: 'style_note', displayName: 'Style Note', attrCode: '#ATTR_stylenote_Style Note*', type: 'STRING', mandatory: true, maxLength: 600 },
  { key: 'age_band', displayName: 'Age Band (Refer LOV List)', attrCode: '#ATTR_ageband_Age Band*', type: 'ENUM', mandatory: true, maxLength: 100 },
  { key: 'color', displayName: 'Color', attrCode: '#ATTR_colorapparel_Color*', type: 'ENUM', mandatory: true, maxLength: 20 },
  { key: 'freebie', displayName: 'Freebie (Refer LOV List)', attrCode: '#ATTR_freebie_Freebie', type: 'STRING', mandatory: false, maxLength: 255 },
  { key: 'brand_description', displayName: 'Brand Description', attrCode: '#ATTR_brandDescription_Brand Description*', type: 'STRING', mandatory: true, maxLength: 500 },
  { key: 'fit', displayName: 'Fit (Refer LOV List)', attrCode: '#ATTR_womentopwearfit_Fit*', type: 'ENUM', mandatory: true, maxLength: 255 },
  { key: 'color_group', displayName: 'Color Group (Refer LOV List)', attrCode: '#ATTR_colorgroupapparel_Color Group', type: 'ENUM', mandatory: false, maxLength: 50 },
  { key: 'feature', displayName: 'Feature', attrCode: '#ATTR_featureapparel_Feature', type: 'STRING', mandatory: false, maxLength: 40 },
  { key: 'brand', displayName: 'Brand (Refer LOV List)', attrCode: '#ATTR_brand_Brand*', type: 'ENUM', mandatory: true, maxLength: 20 },
  { key: 'gst_eligible', displayName: 'GST Eligible', attrCode: '#ATTR_gstEligible_GST Eligible', type: 'STRING', mandatory: false, maxLength: 10 },
  { key: 'weight_apparel', displayName: 'Weight', attrCode: '#ATTR_weightapparel_Weight*', type: 'STRING', mandatory: true, maxLength: 500 },
  { key: 'seller_association_status', displayName: 'Seller Product Association Status', attrCode: '#ATTR_sellerAssociationStatus_Seller Product Association Status*', type: 'ENUM', mandatory: true, maxLength: 100 },
  { key: 'additional_details_1', displayName: 'Additional Details 1', attrCode: '#ATTR_additionaldetails1apparel_Additional Details 1', type: 'STRING', mandatory: false, maxLength: 100 },
  { key: 'tags_internal', displayName: 'Tags', attrCode: '#ATTR_tags_Tags', type: 'STRING', mandatory: false, maxLength: 4000 },
  { key: 'key_trends', displayName: 'Key Trends (Refer LOV List)', attrCode: '#ATTR_keytrendsapparel_Key Trends', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'up_sell_associated_product_status', displayName: 'Up Sell - Associated Product Status', attrCode: '#ATTR_upSellAssociatedProductStatus_Up Sell - Associated Product Status', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'size_chart', displayName: 'Size Chart', attrCode: '#ATTR_sizechart_Size Chart*', type: 'STRING', mandatory: true, maxLength: 255 },
  { key: 'warranty_type', displayName: 'Warranty Type (Refer LOV List)', attrCode: '#ATTR_warrantyType_Warranty Type*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'lead_time', displayName: 'Lead time for the SKU - Home Delivery [No. of Minute]', attrCode: '#ATTR_leadTimeForTheSKUHomeDelivery_Lead time for the SKU - Home Delivery [No. of Minute]*', type: 'INTEGER', mandatory: true, maxLength: 5 },
  { key: 'wash_care', displayName: 'Wash', attrCode: '#ATTR_washcare_Wash*', type: 'STRING', mandatory: true, maxLength: 50 },
  { key: 'style_code', displayName: 'Style Code', attrCode: '#ATTR_stylecode_Style Code*', type: 'STRING', mandatory: true, maxLength: 500 },
  { key: 'occasion', displayName: 'Occasion (Refer LOV List)', attrCode: '#ATTR_occasion_Occasion*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'unisex', displayName: 'Unisex (Refer LOV List)', attrCode: '#ATTR_unisexapparel_Unisex', type: 'ENUM', mandatory: false, maxLength: 20 },
  { key: 'manufacturers_details', displayName: "Manufacturer's Details", attrCode: '#ATTR_manufacturersDetails_Manufacturer\'s Details*', type: 'STRING', mandatory: true, maxLength: 255 },
  { key: 'gender', displayName: 'Gender (Refer LOV List)', attrCode: '#ATTR_gender_Gender', type: 'STRING', mandatory: false, maxLength: 255 },
  { key: 'cross_sell_associated_products', displayName: 'Cross Sell - Associated Products', attrCode: '#ATTR_crossSellAssociatedProducts_Cross Sell - Associated Products', type: 'STRING', mandatory: false, maxLength: 500 },
  { key: 'sleeve_styling', displayName: 'Sleeve Styling (Refer LOV List)', attrCode: '#ATTR_sleevestylingapparel_Sleeve Styling', type: 'ENUM', mandatory: false, maxLength: 30 },
  { key: 'multi_pack', displayName: 'Multi Pack (Refer LOV List)', attrCode: '#ATTR_multipack_Multi Pack*', type: 'ENUM', mandatory: true, maxLength: 255 },
  { key: 'lead_variant_id', displayName: 'Lead Variant ID', attrCode: '#ATTR_leadvariantid_Lead Variant ID', type: 'STRING', mandatory: false, maxLength: 255 },
  { key: 'net_quantity', displayName: 'Net Quantity', attrCode: '#ATTR_netQuantity_Net Quantity*', type: 'STRING', mandatory: true, maxLength: 30 },
  { key: 'display_product_name', displayName: 'Display Product Name', attrCode: '#ATTR_displayproduct_Display Product Name*', type: 'STRING', mandatory: true, maxLength: 40 },
  { key: 'platform', displayName: 'Platform (Refer LOV List)', attrCode: '#ATTR_platform_Platform*', type: 'ENUM', mandatory: true, maxLength: 100 },
  { key: 'season', displayName: 'Season (Refer LOV List)', attrCode: '#ATTR_seasonapparel_Season', type: 'ENUM', mandatory: false, maxLength: 255 },
  { key: 'pattern', displayName: 'Pattern (Refer LOV List)', attrCode: '#ATTR_womenpattern_Pattern', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'model_fit', displayName: 'Model Fit', attrCode: '#ATTR_modelfit_Model Fit*', type: 'STRING', mandatory: true, maxLength: 150 },
  { key: 'color_family', displayName: 'Color Family (Refer LOV List)', attrCode: '#ATTR_colorfamilyapparel_Color Family*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'business_tag', displayName: 'Business Tag (Refer LOV List)', attrCode: '#ATTR_businesstag_Business Tag', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'additional_details_2', displayName: 'Additional Details 2', attrCode: '#ATTR_additionaldetails2apparel_Additional Details 2', type: 'STRING', mandatory: false, maxLength: 100 },
  { key: 'importers_details', displayName: "Importer's Details", attrCode: '#ATTR_importersDetails_Importer\'s Details*', type: 'STRING', mandatory: true, maxLength: 4000 },
  { key: 'pack_color', displayName: 'Pack Color (Refer LOV List)', attrCode: '#ATTR_packcolor_Pack Color', type: 'ENUM', mandatory: false, maxLength: 500 },
  { key: 'dangerous_goods', displayName: 'Dangerous Goods', attrCode: '#ATTR_dangerousGoods_Dangerous Goods', type: 'STRING', mandatory: false, maxLength: 200 },
];

const TAIL_COMMON: OutputColumn[] = [
  { key: 'warranty_period', displayName: 'Warranty Time Period [Months]', attrCode: '#ATTR_warrantyTimePeriod_Warranty Time Period [Months]*', type: 'INTEGER', mandatory: true, maxLength: 5 },
  { key: 'mrp', displayName: 'MRP [INR]', attrCode: '#ATTR_mrp_MRP [INR]*', type: 'STRING', mandatory: true, maxLength: 10 },
  { key: 'fabric', displayName: 'Fabric', attrCode: '#ATTR_fabricapparel_Fabric*', type: 'STRING', mandatory: true, maxLength: 300 },
  { key: 'pack_quantity', displayName: 'Pack Quantity', attrCode: '#ATTR_packquantity_Pack Quantity', type: 'STRING', mandatory: false, maxLength: 5 },
];

// Category-specific column slots
const DRESS_SPECIFIC: OutputColumn[] = [
  // Inserted into the right slot (after sleeve, before tags); positions match Catalogus dress sheet
  { key: 'sleeve', displayName: 'Sleeve (Refer LOV List)', attrCode: '#ATTR_womencasualdressjumpersleeve_Sleeve*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'neck_collar', displayName: 'Neck/Collar (Refer LOV List)', attrCode: '#ATTR_womencasualdressjumperneckcollar_Neck/Collar*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'dress_shape', displayName: 'Dress Shape (Refer LOV List)', attrCode: '#ATTR_dressshape_Dress Shape', type: 'ENUM', mandatory: false, maxLength: 40 },
  { key: 'dress_length', displayName: 'Dress Length (Refer LOV List)', attrCode: '#ATTR_dresslength_Dress Length*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'size', displayName: 'Size (Refer LOV List)', attrCode: '#ATTR_womencasualweardressesjumperssize_Size*', type: 'ENUM', mandatory: true, maxLength: 500 },
];

const TOP_SPECIFIC: OutputColumn[] = [
  { key: 'sleeve', displayName: 'Sleeve (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearsleeve_Sleeve*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'neck_collar', displayName: 'Neck/Collar (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearneckcollar_Neck/Collar*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'tshirt_type', displayName: 'Tshirt Type (Refer LOV List)', attrCode: '#ATTR_tshirttype_Tshirt Type', type: 'ENUM', mandatory: false, maxLength: 50 },
  { key: 'size', displayName: 'Size (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearsize_Size*', type: 'ENUM', mandatory: true, maxLength: 500 },
];

const SHIRT_SPECIFIC: OutputColumn[] = [
  { key: 'sleeve', displayName: 'Sleeve (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearsleeve_Sleeve*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'neck_collar', displayName: 'Neck/Collar (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearneckcollar_Neck/Collar*', type: 'ENUM', mandatory: true, maxLength: 500 },
  { key: 'size', displayName: 'Size (Refer LOV List)', attrCode: '#ATTR_womencasualtopwearsize_Size*', type: 'ENUM', mandatory: true, maxLength: 500 },
];

// Country of origin + Story name always go at the very end
const TAIL_END: OutputColumn[] = [
  { key: 'packers_details', displayName: "Packer's Details", attrCode: '#ATTR_packersDetails_Packer\'s Details*', type: 'STRING', mandatory: true, maxLength: 500 },
  { key: 'country_of_origin', displayName: 'Country of Origin', attrCode: '#ATTR_countryOfOrigin_Country of Origin*', type: 'STRING', mandatory: true, maxLength: 200 },
  { key: 'story_name', displayName: 'Story Name', attrCode: '#ATTR_storyname_Story Name', type: 'STRING', mandatory: false, maxLength: 50 },
];

function getSchemaForCategory(cat: CategoryNode): OutputColumn[] {
  let specific: OutputColumn[];
  if (cat.l4 === 'Casual dresses') specific = DRESS_SPECIFIC;
  else if (cat.l4 === 'Tops and tees') specific = TOP_SPECIFIC;
  else if (cat.l4 === 'casual shirts') specific = SHIRT_SPECIFIC;
  else specific = TOP_SPECIFIC; // sensible default

  // The specific columns slot into the right position in TRAIL_COMMON.
  // Catalogus puts size, neck, sleeve etc near the tail.
  // We append specific between TRAIL_COMMON's tail and TAIL_END.
  return [
    ...COMMON_COLUMNS,
    ...TRAIL_COMMON,
    ...TAIL_COMMON,
    ...specific,
    ...TAIL_END,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD XLSX
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildOutputOptions {
  /** Include a "_QA" sheet with confidence scores and validation flags */
  includeQASheet?: boolean;
  /** Include a "_MDD_Compliance" sheet listing per-row missing mandatory fields */
  includeComplianceSheet?: boolean;
}

export function buildEnrichmentWorkbook(
  enriched: EnrichedRow[],
  opts: BuildOutputOptions = {},
): Buffer {
  const wb = XLSX.utils.book_new();

  // Group enriched rows by L4 category (one sheet per category)
  const byCategory = new Map<string, EnrichedRow[]>();
  for (const r of enriched) {
    const key = r.category.l4;
    const arr = byCategory.get(key) ?? [];
    arr.push(r);
    byCategory.set(key, arr);
  }

  for (const [l4, rows] of byCategory) {
    if (!rows.length) continue;
    const cat = rows[0].category;
    const schema = getSchemaForCategory(cat);
    const sheet = buildCategorySheet(rows, schema);
    const sheetName = sanitizeSheetName(cat.displayName);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  if (opts.includeQASheet) {
    XLSX.utils.book_append_sheet(wb, buildQASheet(enriched), '_QA');
  }
  if (opts.includeComplianceSheet) {
    XLSX.utils.book_append_sheet(wb, buildComplianceSheet(enriched), '_Compliance');
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
  ];
  const aoa: any[][] = [header];
  for (const r of enriched) {
    const high: string[] = [];
    const medium: string[] = [];
    const low: string[] = [];
    for (const [field, conf] of Object.entries(r.confidence)) {
      if (conf >= 0.80) high.push(field);
      else if (conf >= 0.55) medium.push(field);
      else low.push(field);
    }
    aoa.push([
      r.sku,
      r.styleCode,
      r.category.l4,
      r.classificationConfidence.toFixed(2),
      r.classificationReason,
      r.overallConfidence.toFixed(2),
      r.overallConfidence >= 0.80 ? 'HIGH' : r.overallConfidence >= 0.55 ? 'MEDIUM' : 'LOW',
      high.join(', '),
      medium.join(', '),
      low.join(', '),
      r.visionEnriched ? 'Yes' : 'No',
      r.visionConflicts.join(' | '),
      r.missingMandatory.join(', '),
      r.leadVariantId || '(this is lead)',
      r.styleFamily.length,
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 40 }, { wch: 12 }, { wch: 14 },
    { wch: 35 }, { wch: 35 }, { wch: 35 },
    { wch: 12 }, { wch: 45 },
    { wch: 30 }, { wch: 20 }, { wch: 10 },
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

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]]/g, '').slice(0, 31);
}
