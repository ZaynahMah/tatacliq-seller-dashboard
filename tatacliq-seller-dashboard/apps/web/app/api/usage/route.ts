import { NextResponse } from 'next/server';
import { listUsage, summarize } from '@/lib/usage-tracker';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    summary: summarize(),
    recentEvents: listUsage().slice(0, 50),
  });
}
