import { NextResponse } from 'next/server';
import { mockEmails } from '@/lib/mock-data';

/**
 * GET /api/emails
 * Returns parsed seller emails. Phase 1 returns mock data;
 * Phase 2 will proxy to the Node backend which reads from Postgres.
 */
export async function GET() {
  return NextResponse.json({
    emails: mockEmails,
    total: mockEmails.length,
    source: 'mock',
  });
}
