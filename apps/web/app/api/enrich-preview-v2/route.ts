/**
 * v2 preview endpoint — returns JSON summary of the MDD enrichment so the UI
 * can show before/after, confidence scores, and validation flags before the
 * user downloads the full XLSX.
 */
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, type ParsedProduct } from '@/lib/excel';
import { enrichCatalog } from '@/lib/enrichment-engine';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    let excelBuffer: ArrayBuffer | null = null;

    const zipFile = form.get('zip') as File | null;
    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
          excelBuffer = await entry.async('arraybuffer');
          break;
        }
      }
    } else {
      const excelFile = form.get('excel') as File | null;
      if (excelFile) excelBuffer = await excelFile.arrayBuffer();
    }

    if (!excelBuffer) {
      return NextResponse.json(
        { error: 'No Excel file found.' },
        { status: 400 },
      );
    }

    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);
    if (products.length === 0) {
      return NextResponse.json({ error: 'Excel file is empty.' }, { status: 400 });
    }

    // Preview is capped at 30 rows for fast UI feedback
    const slice = products.slice(0, 30);
    const { enriched, report } = enrichCatalog(slice);

    // Diagnostics: surface what columns were detected and how rows were classified.
    // This makes parsing/classification failures debuggable instead of silent.
    const detectedColumns = Object.keys(products[0]?.raw ?? {}).slice(0, 30);
    const classificationBreakdown: Record<string, number> = {};
    let needsHumanReview = 0;
    for (const e of enriched) {
      const key = e.classificationConfidence < 0.3
        ? `LOW_CONFIDENCE (${e.category.l4})`
        : e.category.l4;
      classificationBreakdown[key] = (classificationBreakdown[key] ?? 0) + 1;
      if (e.classificationConfidence < 0.3) needsHumanReview++;
    }

    // Project a UI-friendly summary
    const preview = enriched.map((r) => ({
      sku: r.sku,
      styleCode: r.styleCode,
      category: {
        l1: r.category.l1,
        l2: r.category.l2,
        l3: r.category.l3,
        l4: r.category.l4,
        displayName: r.category.displayName,
      },
      classification: {
        confidence: r.classificationConfidence,
        reason: r.classificationReason,
      },
      isLead: !r.leadVariantId,
      leadVariantId: r.leadVariantId,
      styleFamilySize: r.styleFamily.length,
      overallConfidence: r.overallConfidence,
      missingMandatory: r.missingMandatory,
      // Show a curated subset of the enriched fields in the preview
      enrichedHighlights: {
        title: r.attrs.title,
        description: r.attrs.description,
        mini_description: r.attrs.mini_description,
        meta_title: r.attrs.meta_title,
        meta_keyword: r.attrs.meta_keyword,
        tags: r.attrs.tags,
        fabric_family: r.attrs.fabric_family,
        fit: r.attrs.fit,
        sleeve: r.attrs.sleeve,
        neck_collar: r.attrs.neck_collar,
        pattern: r.attrs.pattern,
        color_family: r.attrs.color_family,
        dress_shape: r.attrs.dress_shape,
        dress_length: r.attrs.dress_length,
        tshirt_type: r.attrs.tshirt_type,
        occasion: r.attrs.occasion,
      },
      // Confidence per highlighted field, for color-coding the UI
      confidence: Object.fromEntries(
        ['title', 'description', 'fabric_family', 'fit', 'sleeve', 'neck_collar',
         'pattern', 'color_family', 'dress_shape', 'dress_length', 'tshirt_type']
          .map((k) => [k, r.confidence[k] ?? 0])
      ),
      source: Object.fromEntries(
        ['title', 'description', 'fabric_family', 'fit', 'sleeve', 'neck_collar',
         'pattern', 'color_family', 'dress_shape', 'dress_length', 'tshirt_type']
          .map((k) => [k, r.source[k] ?? ''])
      ),
    }));

    return NextResponse.json({
      totalProducts: products.length,
      processed: enriched.length,
      truncated: products.length > slice.length,
      report,
      diagnostics: {
        detectedColumns,
        classificationBreakdown,
        needsHumanReview,
        firstRowSample: products[0]?.raw ?? {},
      },
      products: preview,
    });
  } catch (err: any) {
    console.error('[enrich-preview-v2] error:', err);
    return NextResponse.json({ error: err.message ?? 'Preview failed' }, { status: 500 });
  }
}
