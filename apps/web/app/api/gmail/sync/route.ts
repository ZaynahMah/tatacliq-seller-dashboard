import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/gmail/sync
 * Triggers a Gmail sync for the monitored account (zaynah15mahmood@gmail.com).
 * Phase 1 stub. Phase 2 implementation:
 *  - Calls backend `/gmail/sync` which uses googleapis to list new messages
 *    matching seller filters (from:liyana2015za@gmail.com OR subject contains
 *    "Catalog Upload"/"New Inventory")
 *  - Downloads attachments to S3
 *  - Inserts Email + Attachment records
 *  - Enqueues parse jobs on BullMQ
 */
export async function POST(req: NextRequest) {
  // const r = await fetch(`${process.env.API_URL}/gmail/sync`, { method: 'POST' });
  // const data = await r.json();

  return NextResponse.json({
    ok: true,
    message: 'Sync queued (Phase 1 mock).',
    monitoredAccount: process.env.GMAIL_MONITORED_ACCOUNT ?? 'zaynah15mahmood@gmail.com',
    enqueuedAt: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    lastSyncAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    nextSyncAt: new Date(Date.now() + 1000 * 60).toISOString(),
    status: 'idle',
  });
}
