import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, matchImagesToProduct, type ParsedProduct } from '@/lib/excel';
import { enrichProduct } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/enrich-preview
 * Same input as /api/enrich-batch but returns JSON for in-app preview
 * (UI can show enriched fields before user downloads the .xlsx).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    let excelBuffer: ArrayBuffer | null = null;
    const imageMap = new Map<string, { buffer: ArrayBuffer; mime: string }>();

    const zipFile = form.get('zip') as File | null;
    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = name.toLowerCase();
        const baseName = name.split('/').pop() ?? name;
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
          excelBuffer = await entry.async('arraybuffer');
        } else if (lower.match(/\.(jpe?g|png|webp)$/)) {
          imageMap.set(baseName, {
            buffer: await entry.async('arraybuffer'),
            mime: lower.endsWith('.png') ? 'image/png' : 'image/jpeg',
          });
        }
      }
    } else {
      const excelFile = form.get('excel') as File | null;
      if (excelFile) excelBuffer = await excelFile.arrayBuffer();
      const imageFiles = form.getAll('images') as File[];
      for (const f of imageFiles) {
        imageMap.set(f.name, { buffer: await f.arrayBuffer(), mime: f.type || 'image/jpeg' });
      }
    }

    if (!excelBuffer) {
      return NextResponse.json({ error: 'No Excel file found' }, { status: 400 });
    }

    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);
    if (products.length === 0) {
      return NextResponse.json({ error: 'Excel is empty or unparseable' }, { status: 400 });
    }

    const toProcess = products.slice(0, 20);
    const imageFilenames = Array.from(imageMap.keys());

    const enriched = await Promise.all(
      toProcess.map(async (product) => {
        const matched = matchImagesToProduct(product, imageFilenames);
        let imageBase64: string | undefined;
        let imageMime: string | undefined;
        if (matched.length > 0) {
          const first = imageMap.get(matched[0]);
          if (first) {
            imageBase64 = Buffer.from(first.buffer).toString('base64');
            imageMime = first.mime;
          }
        }
        const result = await enrichProduct({
          product,
          imageBase64,
          imageMimeType: imageMime,
        });
        result.matchedImages = matched;
        return result;
      }),
    );

    return NextResponse.json({
      totalProducts: products.length,
      processed: enriched.length,
      truncated: products.length > toProcess.length,
      averageConfidence: Math.round(
        enriched.reduce((s, p) => s + p.confidence, 0) / enriched.length,
      ),
      usedGemini: Boolean(process.env.GEMINI_API_KEY),
      imagesFound: imageFilenames.length,
      products: enriched.map((p) => ({
        rowIndex: p.rowIndex,
        sku: p.sku,
        title: p.title,
        brand: p.brand,
        mrp: p.mrp,
        confidence: p.confidence,
        enriched: p.enriched,
        matchedImages: p.matchedImages,
      })),
    });
  } catch (err: any) {
    console.error('[enrich-preview] error:', err);
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
