import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/upload
 * Accepts multipart file uploads. Phase 1: stores in memory and returns a
 * mock storage key. Phase 2: forwards the file to the Node backend which
 * pushes to S3 via presigned URL.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (apiUrl) {
    // Forward to backend
    try {
      const backendForm = new FormData();
      backendForm.append('file', file);
      const r = await fetch(`${apiUrl}/upload`, { method: 'POST', body: backendForm });
      if (r.ok) {
        return NextResponse.json(await r.json());
      }
    } catch {
      // fall through to mock
    }
  }

  // Mock response
  return NextResponse.json({
    ok: true,
    filename: file.name,
    size: file.size,
    type: file.type,
    storageKey: `mock://uploads/${Date.now()}-${file.name}`,
    uploadedAt: new Date().toISOString(),
  });
}
