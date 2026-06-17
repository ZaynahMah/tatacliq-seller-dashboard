export type EmailStatus = 'pending' | 'processing' | 'enriched' | 'validated' | 'failed' | 'awaiting_seller';

export interface SellerEmail {
  id: string;
  sellerName: string;
  sellerEmail: string;
  subject: string;
  receivedAt: string;
  attachmentCount: number;
  productCount: number;
  status: EmailStatus;
  aiConfidence?: number;
  missingFields?: number;
  preview: string;
}

export const mockEmails: SellerEmail[] = [
  {
    id: 'em_001',
    sellerName: 'Liyana Fashion House',
    sellerEmail: 'liyana2015za@gmail.com',
    subject: 'New Inventory — Summer Women\'s Kurta Collection (42 SKUs)',
    receivedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    attachmentCount: 3,
    productCount: 42,
    status: 'processing',
    aiConfidence: 87,
    missingFields: 6,
    preview: 'Hi team, sharing our latest summer kurta collection. 42 SKUs total. All sizes available. Excel attached, images in ZIP. Please process at the earliest.',
  },
  {
    id: 'em_002',
    sellerName: 'Urban Threads Apparel',
    sellerEmail: 'orders@urbanthreads.in',
    subject: 'Catalog Upload — Men\'s Casual Shirts Q4',
    receivedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    attachmentCount: 2,
    productCount: 28,
    status: 'enriched',
    aiConfidence: 94,
    missingFields: 0,
    preview: 'Q4 men\'s casual shirts. 28 SKUs. HSN codes attached. Need fast turnaround for festive season.',
  },
  {
    id: 'em_003',
    sellerName: 'Bombay Silk Stories',
    sellerEmail: 'catalog@bombaysilk.com',
    subject: 'New Inventory — Banarasi Saree Range',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    attachmentCount: 5,
    productCount: 18,
    status: 'awaiting_seller',
    aiConfidence: 72,
    missingFields: 14,
    preview: 'Bridal banarasi sarees, premium range. Some attribute fields blank — please advise.',
  },
  {
    id: 'em_004',
    sellerName: 'Northstar Denim Co.',
    sellerEmail: 'wholesale@northstardenim.in',
    subject: 'Catalog Upload — Premium Denim AW25',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    attachmentCount: 1,
    productCount: 56,
    status: 'validated',
    aiConfidence: 96,
    missingFields: 0,
    preview: 'Premium denim line, 56 SKUs across men and women. Wash care included.',
  },
  {
    id: 'em_005',
    sellerName: 'Pastel Athleisure',
    sellerEmail: 'team@pastelath.com',
    subject: 'New Inventory — Activewear Capsule Drop',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    attachmentCount: 2,
    productCount: 24,
    status: 'pending',
    preview: 'Capsule activewear drop. Yoga pants, sports bras, joggers.',
  },
  {
    id: 'em_006',
    sellerName: 'Kidville Designs',
    sellerEmail: 'kidville.designs@gmail.com',
    subject: 'New Inventory — Kids\' Ethnic Wear',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    attachmentCount: 4,
    productCount: 33,
    status: 'failed',
    aiConfidence: 41,
    missingFields: 22,
    preview: 'Excel format issue — some SKUs missing critical fields. Please review.',
  },
  {
    id: 'em_007',
    sellerName: 'Heritage Weaves',
    sellerEmail: 'sales@heritageweaves.com',
    subject: 'Catalog Upload — Handloom Cotton Sarees',
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    attachmentCount: 3,
    productCount: 19,
    status: 'enriched',
    aiConfidence: 89,
    missingFields: 2,
    preview: 'Handloom cottons, all natural dyes. Origin certificates attached.',
  },
];

export const mockProcessingStats = {
  totalToday: 184,
  enriched: 142,
  inQueue: 23,
  failed: 6,
  avgConfidence: 89.4,
  avgProcessingTime: '2m 14s',
  costSavedThisMonth: 4.82,
};

export interface QueueJob {
  id: string;
  type: 'enrichment' | 'image' | 'validation' | 'sheet_generation';
  emailId: string;
  productName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'retrying';
  progress: number;
  worker?: string;
  startedAt?: string;
  duration?: string;
  attempts: number;
}

export const mockQueue: QueueJob[] = [
  { id: 'job_001', type: 'enrichment', emailId: 'em_001', productName: 'Yellow Floral Anarkali Kurta', status: 'running', progress: 64, worker: 'gemini-worker-1', startedAt: new Date(Date.now() - 1000 * 80).toISOString(), attempts: 1 },
  { id: 'job_002', type: 'image', emailId: 'em_001', productName: 'Cotton A-line Kurti Set', status: 'running', progress: 38, worker: 'sdxl-worker-2', startedAt: new Date(Date.now() - 1000 * 45).toISOString(), attempts: 1 },
  { id: 'job_003', type: 'enrichment', emailId: 'em_005', productName: 'High-waist Yoga Leggings', status: 'queued', progress: 0, attempts: 0 },
  { id: 'job_004', type: 'validation', emailId: 'em_002', productName: 'Linen Casual Shirt - Slim Fit', status: 'completed', progress: 100, worker: 'validator-1', duration: '12s', attempts: 1 },
  { id: 'job_005', type: 'sheet_generation', emailId: 'em_004', productName: 'Master sheet (56 SKUs)', status: 'completed', progress: 100, worker: 'sheet-worker-1', duration: '41s', attempts: 1 },
  { id: 'job_006', type: 'image', emailId: 'em_006', productName: 'Boys Sherwani Set', status: 'retrying', progress: 12, worker: 'sdxl-worker-1', startedAt: new Date(Date.now() - 1000 * 20).toISOString(), attempts: 2 },
  { id: 'job_007', type: 'enrichment', emailId: 'em_003', productName: 'Red Banarasi Bridal Saree', status: 'failed', progress: 78, attempts: 3 },
];

export interface Product {
  id: string;
  emailId: string;
  title: string;
  image: string;
  attributes: {
    productType?: string;
    hsnCode?: string;
    sku?: string;
    fabricFamily?: string;
    sleeveType?: string;
    ageBand?: string;
    fitType?: string;
    neckline?: string;
    occasion?: string;
    pattern?: string;
    colorFamily?: string;
    mrp?: number;
    countryOfOrigin?: string;
    ean?: string;
    washCare?: string;
    fabricComposition?: string;
  };
  aiSuggestions: Record<string, { value: string | number; confidence: number; source: string }>;
  missing: string[];
  confidence: number;
}

export const mockProducts: Product[] = [
  {
    id: 'p_001',
    emailId: 'em_001',
    title: 'Yellow Floral Anarkali Kurta',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600',
    attributes: {
      productType: 'Kurta',
      sku: 'LFH-AK-Y042',
      colorFamily: 'Yellow',
      mrp: 2499,
    },
    aiSuggestions: {
      hsnCode: { value: '62043200', confidence: 96, source: 'gemini-vision' },
      fabricFamily: { value: 'Cotton Blend', confidence: 92, source: 'gemini-text' },
      sleeveType: { value: '3/4 Sleeve', confidence: 88, source: 'gemini-vision' },
      fitType: { value: 'A-line Anarkali', confidence: 94, source: 'gemini-vision' },
      neckline: { value: 'Round Neck', confidence: 91, source: 'gemini-vision' },
      occasion: { value: 'Festive / Casual', confidence: 86, source: 'gemini-text' },
      pattern: { value: 'Floral Print', confidence: 97, source: 'gemini-vision' },
      ageBand: { value: 'Adult (18-50)', confidence: 99, source: 'rule-based' },
      washCare: { value: 'Machine wash cold', confidence: 78, source: 'gemini-text' },
      fabricComposition: { value: 'Cotton 60% / Polyester 40%', confidence: 74, source: 'cross-ref-myntra' },
      countryOfOrigin: { value: 'India', confidence: 99, source: 'seller-default' },
      ean: { value: '8901234567894', confidence: 65, source: 'generated' },
    },
    missing: ['ean', 'washCare', 'fabricComposition'],
    confidence: 87,
  },
];

export interface ValidationIssue {
  id: string;
  productId: string;
  productTitle: string;
  type: 'missing_field' | 'invalid_ean' | 'duplicate_sku' | 'invalid_hsn' | 'low_confidence';
  severity: 'error' | 'warning' | 'info';
  field?: string;
  message: string;
  suggestion?: string;
}

export const mockValidationIssues: ValidationIssue[] = [
  { id: 'v_001', productId: 'p_001', productTitle: 'Yellow Floral Anarkali Kurta', type: 'missing_field', severity: 'error', field: 'EAN', message: 'EAN code is missing or invalid', suggestion: 'AI-generated EAN: 8901234567894 (65% conf)' },
  { id: 'v_002', productId: 'p_002', productTitle: 'Cotton A-line Kurti Set', type: 'duplicate_sku', severity: 'error', field: 'SKU', message: 'SKU "LFH-CK-001" already exists in master catalog', suggestion: 'Use LFH-CK-002 or confirm intentional duplicate' },
  { id: 'v_003', productId: 'p_003', productTitle: 'Red Banarasi Bridal Saree', type: 'invalid_hsn', severity: 'warning', field: 'HSN', message: 'HSN "5407" is at 4-digit level; portal requires 8-digit', suggestion: 'Suggested: 54071094 (silk woven fabric, dyed)' },
  { id: 'v_004', productId: 'p_004', productTitle: 'Boys Sherwani Set', type: 'low_confidence', severity: 'warning', field: 'Fabric', message: 'Fabric family detection only 54% confident', suggestion: 'Request clearer product image from seller' },
  { id: 'v_005', productId: 'p_005', productTitle: 'High-waist Yoga Leggings', type: 'missing_field', severity: 'info', field: 'Wash Care', message: 'Wash care instructions not provided', suggestion: 'AI-inferred: Machine wash cold, do not bleach (78% conf)' },
];

export const analyticsData = {
  weeklyVolume: [
    { day: 'Mon', enriched: 142, failed: 8 },
    { day: 'Tue', enriched: 168, failed: 6 },
    { day: 'Wed', enriched: 134, failed: 11 },
    { day: 'Thu', enriched: 189, failed: 4 },
    { day: 'Fri', enriched: 201, failed: 9 },
    { day: 'Sat', enriched: 76, failed: 2 },
    { day: 'Sun', enriched: 48, failed: 1 },
  ],
  confidenceTrend: [
    { week: 'W1', score: 78 },
    { week: 'W2', score: 81 },
    { week: 'W3', score: 84 },
    { week: 'W4', score: 87 },
    { week: 'W5', score: 89 },
    { week: 'W6', score: 91 },
  ],
  sellerQuality: [
    { name: 'Urban Threads', score: 96, products: 248 },
    { name: 'Northstar Denim', score: 94, products: 312 },
    { name: 'Liyana Fashion', score: 87, products: 184 },
    { name: 'Heritage Weaves', score: 89, products: 142 },
    { name: 'Pastel Athleisure', score: 82, products: 96 },
    { name: 'Bombay Silk', score: 72, products: 88 },
    { name: 'Kidville Designs', score: 64, products: 156 },
  ],
};
