import { NextRequest, NextResponse } from 'next/server';
import { enhanceImage, type EnhanceMode } from '@/lib/image-enhance';
import { trackUsage } from '@/lib/usage-tracker';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const VALID_MODES: EnhanceMode[] = [
  'smart_fit',
  'extend_background',
  'white_studio',
  'marketplace_portrait',
  'pure_white',
  'pure_black',
];

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('image') as File | null;
    const width = Number(form.get('width') ?? 1080);
    const height = Number(form.get('height') ?? 1440);
    const productContext = (form.get('productContext') as string) ?? '';
    const modeRaw = (form.get('mode') as string) ?? 'smart_fit';
    const mode = (VALID_MODES.includes(modeRaw as EnhanceMode)
      ? modeRaw
      : 'smart_fit') as EnhanceMode;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type ${file.type}. Use JPG, PNG, or WebP.` },
        { status: 400 },
      );
    }
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 200 ||
      height < 200 ||
      width > 4096 ||
      height > 4096
    ) {
      return NextResponse.json(
        { error: 'Width and height must be between 200 and 4096 pixels' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await enhanceImage({
      imageBuffer: buffer,
      imageMime: file.type,
      targetWidth: width,
      targetHeight: height,
      mode,
      productContext,
    });

    // Track usage for analytics
    trackUsage({
      kind: 'image_enhance',
      engine: result.engine,
      mode: result.mode,
      width: result.targetWidth,
      height: result.targetHeight,
      tokensIn: result.usage?.inputImageTokens ?? 0,
      tokensOut: result.usage?.outputImageTokens ?? 0,
      costUsd: result.usage?.estimatedCostUsd ?? 0,
    });

    return NextResponse.json({
      ok: true,
      enhancedDataUrl: `data:${result.enhancedMime};base64,${result.enhancedBuffer.toString('base64')}`,
      originalDataUrl: `data:${file.type};base64,${buffer.toString('base64')}`,
      originalWidth: result.originalWidth,
      originalHeight: result.originalHeight,
      targetWidth: result.targetWidth,
      targetHeight: result.targetHeight,
      subjectBox: result.subjectBox,
      cropRisk: result.cropRisk,
      engine: result.engine,
      mode: result.mode,
      notes: result.notes,
      usage: result.usage,
    });
  } catch (err: any) {
    console.error('[enhance-image] error:', err);
    return NextResponse.json({ error: err.message ?? 'Enhancement failed' }, { status: 500 });
  }
}
