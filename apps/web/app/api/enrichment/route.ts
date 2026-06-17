import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/enrichment
 * Triggers Gemini enrichment for an email/product batch.
 * Phase 2 will:
 *  - Validate emailId / productIds
 *  - Enqueue `gemini-enrich` BullMQ job
 *  - Return jobId for the UI to poll
 *
 * Body: { emailId?: string, productIds?: string[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { emailId, productIds } = body ?? {};

  if (!emailId && (!productIds || productIds.length === 0)) {
    return NextResponse.json(
      { error: 'Must provide emailId or productIds' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    jobId: `job_${Math.random().toString(36).slice(2, 10)}`,
    emailId,
    productCount: productIds?.length ?? 'all',
    enqueuedAt: new Date().toISOString(),
    estimatedDurationSec: 120,
  });
}
