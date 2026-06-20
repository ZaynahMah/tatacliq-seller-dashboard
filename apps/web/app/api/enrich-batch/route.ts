import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, buildEnrichedExcel, matchImagesToProduct, type ParsedProduct } from '@/lib/excel';
import { enrichProduct } from '@/lib/gemini';
import { trackUsage } from '@/lib/usage-tracker';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/enrich-batch
 *
 * Receives:
 *   - "excel" file (multipart) — seller's catalog .xlsx or .csv
 *   - "images" files (multipart, multiple) — product images (optional)
 *   OR
 *   - "zip" file (multipart) — ZIP containing Excel + images
 *
 * Returns:
 *   - Enriched .xlsx file as a download
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    let excelBuffer: ArrayBuffer | null = null;
    let excelFilename = 'catalog.xlsx';
    const imageMap = new Map<string, { buffer: ArrayBuffer; mime: string }>();

    // Option A: ZIP file containing everything
    const zipFile = form.get('zip') as File | null;
    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = name.toLowerCase();
        const baseName = name.split('/').pop() ?? name;
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
          excelBuffer = await entry.async('arraybuffer');
          excelFilename = baseName;
        } else if (lower.match(/\.(jpe?g|png|webp)$/)) {
          imageMap.set(baseName, {
            buffer: await entry.async('arraybuffer'),
            mime: lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
          });
        }
      }
    } else {
      // Option B: separate excel + images
      const excelFile = form.get('excel') as File | null;
      if (excelFile) {
        excelBuffer = await excelFile.arrayBuffer();
        excelFilename = excelFile.name;
      }
      const imageFiles = form.getAll('images') as File[];
      for (const f of imageFiles) {
        imageMap.set(f.name, {
          buffer: await f.arrayBuffer(),
          mime: f.type || 'image/jpeg',
        });
      }
    }

    if (!excelBuffer) {
      return NextResponse.json(
        { error: 'No Excel file found. Upload a .xlsx/.csv file or a .zip containing one.' },
        { status: 400 },
      );
    }

    // Parse the seller's Excel
    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty or could not be parsed.' },
        { status: 400 },
      );
    }

    // Cap at 20 products per request to keep latency manageable
    const toProcess = products.slice(0, 20);
    const imageFilenames = Array.from(imageMap.keys());

    // Enrich each product in parallel (with sensible concurrency)
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

    // Build the enriched Excel
    const enrichedBuffer = buildEnrichedExcel(enriched);

    // Track usage for analytics. Approximate token counts:
    // Per product ≈ 200 input + 600 output text tokens with Gemini 2.5 Flash.
    // 2.5 Flash text price: $0.30/M in, $2.50/M out.
    const usedGemini = Boolean(process.env.GEMINI_API_KEY);
    const tokensIn = enriched.length * 200;
    const tokensOut = enriched.length * 600;
    const costUsd = usedGemini
      ? (tokensIn * 0.30 + tokensOut * 2.50) / 1_000_000
      : 0;
    trackUsage({
      kind: 'catalog_enrich',
      engine: usedGemini ? 'gemini' : 'mock',
      productCount: enriched.length,
      tokensIn,
      tokensOut,
      costUsd,
    });

    // Return as a downloadable file
    const filename = excelFilename.replace(/\.(xlsx|xls|csv)$/i, '') + '_enriched.xlsx';
    return new NextResponse(enrichedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Products-Processed': String(enriched.length),
        'X-Average-Confidence': String(
          Math.round(enriched.reduce((s, p) => s + p.confidence, 0) / enriched.length),
        ),
        'X-Used-Gemini': String(Boolean(process.env.GEMINI_API_KEY)),
      },
    });
  } catch (err: any) {
    console.error('[enrich-batch] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Enrichment failed' },
      { status: 500 },
    );
  }
}
