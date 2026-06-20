/**
 * Usage tracker for cost analytics.
 *
 * Phase 1: in-memory rolling log (loses data on server restart). The dashboard
 * /usage page reads from this. In production this would write to Postgres
 * with daily/monthly aggregations.
 *
 * Pricing (Gemini, May 2026):
 *   - 2.5 Flash text:        $0.30/M in,  $2.50/M out
 *   - 2.5 Flash Image:       $0.30/M in,  $30.00/M out  (~$0.039 per image)
 *   - Input image token cost: 1290 tokens ≈ $0.00039
 */

export type UsageEvent =
  | {
      kind: 'image_enhance';
      engine: 'gemini' | 'sharp-fallback';
      mode: string;
      width: number;
      height: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      at: string;
    }
  | {
      kind: 'catalog_enrich';
      engine: 'gemini' | 'mock' | 'rules';
      productCount: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      at: string;
    };

// Module-level store. Survives across requests in the same Node process.
const events: UsageEvent[] = [];
const MAX_EVENTS = 5000;

// Helper types so callers can pass either variant cleanly through Omit.
export type UsageEventInput =
  | Omit<Extract<UsageEvent, { kind: 'image_enhance' }>, 'at'>
  | Omit<Extract<UsageEvent, { kind: 'catalog_enrich' }>, 'at'>;

export function trackUsage(ev: UsageEventInput) {
  events.unshift({ ...ev, at: new Date().toISOString() } as UsageEvent);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

export function listUsage(): UsageEvent[] {
  return events.slice();
}

export interface UsageSummary {
  totalEvents: number;
  totalCostUsd: number;
  totalTokens: number;

  imageEvents: number;
  catalogEvents: number;
  totalProductsEnriched: number;
  totalImagesEnhanced: number;

  geminiEvents: number;
  fallbackEvents: number;
  geminiPercentage: number;

  avgCostPerImageUsd: number;
  avgCostPerProductUsd: number;
  avgCostPerSheetUsd: number;
  avgTokensPerImage: number;
  avgTokensPerProduct: number;

  byMode: Record<string, { count: number; costUsd: number }>;

  // Last 30 days rolling estimate
  monthlyProjectionUsd: number;
  monthlyProjectionInr: number;
}

const USD_TO_INR = 83.5;

export function summarize(): UsageSummary {
  const imgEvents = events.filter((e): e is Extract<UsageEvent, { kind: 'image_enhance' }> => e.kind === 'image_enhance');
  const catEvents = events.filter((e): e is Extract<UsageEvent, { kind: 'catalog_enrich' }> => e.kind === 'catalog_enrich');

  const totalCost = events.reduce((s, e) => s + e.costUsd, 0);
  const totalTokens = events.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0);

  const geminiCount = events.filter((e) =>
    e.kind === 'image_enhance' ? e.engine === 'gemini' : e.engine === 'gemini',
  ).length;
  const fallbackCount = events.length - geminiCount;

  const totalProducts = catEvents.reduce((s, e) => s + e.productCount, 0);
  const totalImages = imgEvents.length;

  const totalImageCost = imgEvents.reduce((s, e) => s + e.costUsd, 0);
  const totalCatalogCost = catEvents.reduce((s, e) => s + e.costUsd, 0);

  const byMode: Record<string, { count: number; costUsd: number }> = {};
  for (const e of imgEvents) {
    byMode[e.mode] = byMode[e.mode] ?? { count: 0, costUsd: 0 };
    byMode[e.mode].count++;
    byMode[e.mode].costUsd += e.costUsd;
  }

  // Monthly projection: scale current usage to 30 days based on event timestamps
  const now = Date.now();
  const oldest = events.length > 0 ? new Date(events[events.length - 1].at).getTime() : now;
  const windowDays = Math.max(1, (now - oldest) / (1000 * 60 * 60 * 24));
  const monthlyScale = 30 / windowDays;
  const monthlyUsd = totalCost * monthlyScale;

  return {
    totalEvents: events.length,
    totalCostUsd: totalCost,
    totalTokens,

    imageEvents: imgEvents.length,
    catalogEvents: catEvents.length,
    totalProductsEnriched: totalProducts,
    totalImagesEnhanced: totalImages,

    geminiEvents: geminiCount,
    fallbackEvents: fallbackCount,
    geminiPercentage: events.length > 0 ? (geminiCount / events.length) * 100 : 0,

    avgCostPerImageUsd: totalImages > 0 ? totalImageCost / totalImages : 0.039,
    avgCostPerProductUsd: totalProducts > 0 ? totalCatalogCost / totalProducts : 0.0008,
    avgCostPerSheetUsd: catEvents.length > 0 ? totalCatalogCost / catEvents.length : 0,
    avgTokensPerImage: totalImages > 0
      ? imgEvents.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0) / totalImages
      : 2580,
    avgTokensPerProduct: totalProducts > 0
      ? catEvents.reduce((s, e) => s + e.tokensIn + e.tokensOut, 0) / totalProducts
      : 800,

    byMode,

    monthlyProjectionUsd: monthlyUsd,
    monthlyProjectionInr: monthlyUsd * USD_TO_INR,
  };
}
