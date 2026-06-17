/**
 * Single source of truth for the mandatory enrichment fields.
 * Imported by both the web app and the API.
 */

export const MANDATORY_FIELDS = [
  'product_type',
  'hsn_code',
  'sku',
  'title',
  'seo_keywords',
  'description',
  'fabric_family',
  'sleeve_type',
  'age_band',
  'brand_description',
  'fit_type',
  'features',
  'wash_care',
  'neck_collar',
  'occasion',
  'pattern',
  'color_family',
  'mrp',
  'fabric_composition',
  'size_chart',
  'country_of_origin',
  'manufacturer',
  'ean',
  'seller_id',
  'cuff_style',
  'hemline',
  'transparency',
  'branding_logo',
  'pocket_type',
  'neckline',
  'stitching',
] as const;

export type MandatoryField = (typeof MANDATORY_FIELDS)[number];

export const COMPLIANCE_FIELDS: MandatoryField[] = [
  'hsn_code',
  'ean',
  'country_of_origin',
  'manufacturer',
];

export const FORBIDDEN_SOURCES = ['tatacliq', 'tata cliq', 'tata-cliq'] as const;

export const ALLOWED_CROSS_REF_SOURCES = [
  'myntra',
  'ajio',
  'amazon fashion',
  'amazon.in',
] as const;
