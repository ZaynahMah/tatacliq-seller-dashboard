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

    // ── Derived report metrics (shown in the dashboard's Report card) ────
    // Cells scanned: total mandatory cells across all rows that the engine
    //   evaluated (filled, flagged, or left for review). Anchors the
    //   "X issues out of Y cells" framing.
    // Issues found: cells that needed attention — either Vision flagged a
    //   conflict (auto-corrected or not) OR the cell was missing originally
    //   and the engine had to source a value (or leave it blank).
    // Auto-filled: cells we wrote a value into without flagging — either
    //   filled-from-missing (no seller value, engine sourced one from Vision
    //   or text inference) or auto-corrected on conflict (>80% Vision conf).
    // Flagged for review: cells that need a human — still-blank mandatory
    //   cells PLUS conflict rows where we kept seller and flagged the
    //   Vision dissent.
    // Group-consensus: rows that inherited Vision results from a sibling
    //   lead SKU in the same style family (a "free" enrichment vs a
    //   separately-billed Vision call).
    // Rows errored: rows whose Vision call returned an error.
    let cellsScanned = 0;
    let autoFilled = 0;
    let flaggedForReview = 0;
    const groupConsensusRowSet = new Set<string>();
    let rowsErrored = 0;
    for (const r of enriched) {
      cellsScanned += r.category.mandatoryAttrs.length;

      // Track which mandatory keys have been counted already so a flaggedItem
      // and a non-seller fill on the same key aren't double-counted.
      const accountedKeys = new Set<string>();

      // 1) Every Vision-flagged item contributes either an auto-fill or a flag
      for (const f of r.flaggedItems) {
        if (f.autoCorrected) autoFilled++;
        else flaggedForReview++;
        accountedKeys.add(f.field);
      }

      // 2) Still-blank mandatory cells = needs review
      for (const key of r.missingMandatory) {
        if (!accountedKeys.has(key)) {
          flaggedForReview++;
          accountedKeys.add(key);
        }
      }

      // 3) Mandatory cells we filled from a non-seller source (Vision,
      //    inference, or normalized derivation) that weren't already
      //    counted above as conflict-flagged
      for (const key of r.category.mandatoryAttrs) {
        if (accountedKeys.has(key)) continue;
        const val = r.attrs[key];
        const src = r.source[key];
        if (val && String(val).trim() !== '' && src && src !== 'seller') {
          autoFilled++;
          accountedKeys.add(key);
        }
      }

      // Group consensus: this row is a non-lead variant that inherited
      // Vision results from a sibling lead in its style family. EnrichedRow
      // sets leadVariantId to '' for the lead itself, and to the lead's
      // SKU for non-lead variants — so a non-empty leadVariantId that
      // differs from the row's own SKU means "inherited".
      if (r.leadVariantId && r.leadVariantId !== r.sku) {
        groupConsensusRowSet.add(r.sku);
      }
      // Errored row: any flaggedItem field tagged as vision_error
      if (r.flaggedItems.some((f) => f.field === '__vision_error')) rowsErrored++;
    }
    const issuesFound = autoFilled + flaggedForReview;
    const groupConsensus = groupConsensusRowSet.size;

    const totalCostUsd = visionStats?.actualCostUsd ?? visionStats?.estimatedCostUsd ?? 0;
    const USD_TO_INR = 83;
    const reportMetrics = {
      generatedAt: new Date().toISOString(),
      model: 'gemini-2.5-flash',
      confidenceThresholdPct: 80,
      products: enriched.length,
      cellsScanned,
      issuesFound,
      autoFilled,
      flaggedForReview,
      groupConsensus,
      rowsErrored,
      inputTokens: visionStats?.totalTokensIn ?? 0,
      outputTokens: visionStats?.totalTokensOut ?? 0,
      estCostUsd: totalCostUsd,
      estCostInr: totalCostUsd * USD_TO_INR,
      costPerProductInr: enriched.length > 0
        ? (totalCostUsd * USD_TO_INR) / enriched.length
        : 0,
      goldenSheetUploaded: false, // wired when accuracy scoring is added
    };

    return NextResponse.json({
      totalProducts: products.length,
      processed: enriched.length,
      truncated: products.length > slice.length,
      report,
      reportMetrics,
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
