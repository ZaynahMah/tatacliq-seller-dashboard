/**
 * v3 preview endpoint — JSON preview of Vision-augmented enrichment.
 *
 * Returns per-row breakdown showing:
 *   - Vision-extracted attributes (with confidence, source = 'image')
 *   - Conflicts between seller text and Vision output
 *   - Final merged values
 *   - Cost estimate for the Vision pass
 *
 * Capped at 30 rows for fast UI feedback. Use enrich-batch-v3 for full output.
 */
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, type ParsedProduct } from '@/lib/excel';
import { enrichCatalog, getStyleFamilyLeads } from '@/lib/enrichment-engine';
import { analyzeLeads } from '@/lib/vision-enrichment';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const useImageInference = form.get('useImageInference') === 'true';

    // ─── Extract file ────────────────────────────────────────────────────
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
      return NextResponse.json({ error: 'No Excel file uploaded.' }, { status: 400 });
    }

    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);
    if (products.length === 0) {
      return NextResponse.json({ error: 'Excel file is empty.' }, { status: 400 });
    }

    // Preview cap = 30 rows
    const slice = products.slice(0, 30);

    // ─── Vision pass ─────────────────────────────────────────────────────
    let visionMap = new Map<string, any>();
    let visionStats: any = null;
    let visionAttempted = false;
    const hasApiKey = !!process.env.GEMINI_API_KEY;

    if (useImageInference && hasApiKey) {
      visionAttempted = true;
      const leads = getStyleFamilyLeads(slice);
      const result = await analyzeLeads(leads, { maxLeads: 30 });
      visionMap = result.visionMap;
      visionStats = result.stats;
    }

    // ─── Run pipeline ────────────────────────────────────────────────────
    const { enriched, report } = enrichCatalog(slice, {
      imageInferenceAvailable: visionAttempted,
      visionAttrs: visionMap,
    });

    // ─── Build per-row preview ───────────────────────────────────────────
    const preview = enriched.map((e) => ({
      sku: e.sku,
      isLead: !e.leadVariantId,
      category: { l1: e.category.l1, l2: e.category.l2, l3: e.category.l3, l4: e.category.l4 },
      classification: {
        confidence: e.classificationConfidence,
        reason: e.classificationReason,
      },
      styleFamilySize: e.styleFamily.length,
      overallConfidence: e.overallConfidence,
      enrichedHighlights: {
        title: e.attrs.title ?? '',
        description: e.attrs.description ?? '',
        color_family: e.attrs.color_family ?? '',
        pattern: e.attrs.pattern ?? '',
        fabric_family: e.attrs.fabric_family ?? '',
        sleeve: e.attrs.sleeve ?? '',
        neck_collar: e.attrs.neck_collar ?? '',
        fit: e.attrs.fit ?? '',
        dress_shape: e.attrs.dress_shape ?? '',
        dress_length: e.attrs.dress_length ?? '',
        tshirt_type: e.attrs.tshirt_type ?? '',
        size: e.attrs.size ?? '',
        mrp: e.attrs.mrp ?? '',
        occasion: e.attrs.occasion ?? '',
      },
      confidence: e.confidence,
      source: e.source,
      missingMandatory: e.missingMandatory,
      visionEnriched: e.visionEnriched,
      visionConflicts: e.visionConflicts,
    }));

    // ─── Diagnostics ────────────────────────────────────────────────────
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

    const totalConflicts = enriched.reduce((s, e) => s + e.visionConflicts.length, 0);
    const visionEnrichedCount = enriched.filter((e) => e.visionEnriched).length;

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
      vision: {
        requested: useImageInference,
        attempted: visionAttempted,
        apiKeyConfigured: hasApiKey,
        rowsEnriched: visionEnrichedCount,
        conflictsFlagged: totalConflicts,
        stats: visionStats,
        // Sample of Vision raw extractions for top 3 leads (for the UI)
        sampleExtractions: Array.from(visionMap.entries()).slice(0, 3).map(([sku, attrs]) => ({
          sku,
          color_family: attrs.color_family,
          pattern: attrs.pattern,
          neck_collar: attrs.neck_collar,
          sleeve: attrs.sleeve,
          dress_shape: attrs.dress_shape,
          dress_length: attrs.dress_length,
          color_specific: attrs.color_specific,
          design_details: attrs.design_details,
          visual_description: attrs.visual_description,
          confidence: attrs.confidence,
          imagesAnalyzed: attrs.imagesAnalyzed,
          error: attrs.error,
        })),
      },
      products: preview,
    });
  } catch (err: any) {
    console.error('[enrich-preview-v3] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Preview failed' },
      { status: 500 },
    );
  }
}
