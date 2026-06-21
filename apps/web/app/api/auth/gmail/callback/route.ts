import { NextRequest, NextResponse } from 'next/server';

/**
 * Gmail OAuth callback.
 * Phase 1 stub — Phase 2 will exchange `code` for tokens via googleapis
 * and persist them server-side (see apps/api/src/services/gmail.service.ts).
 *
 * Flow:
 *  1. User clicks "Connect Gmail" in Settings -> redirected to Google consent
 *  2. Google redirects back here with ?code=...
 *  3. We exchange the code for access + refresh tokens
 *  4. Persist tokens against the operations user (zaynah15mahmood@gmail.com)
 *  5. Trigger initial Gmail sync
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/settings?gmail=error&reason=${error}`, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?gmail=missing_code', req.url));
  }

  // TODO (Phase 2): forward to backend
  // await fetch(`${process.env.API_URL}/auth/gmail/exchange`, {
  //   method: 'POST',
  //   body: JSON.stringify({ code }),
  // });

  return NextResponse.redirect(new URL('/settings?gmail=connected', req.url));
}
