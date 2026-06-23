/**
 * v3 enrichment endpoint — Vision-augmented MDD pipeline.
 *
 * Differs from v2 by adding a Gemini 2.5 Flash Vision pass:
 *   1. Parse Excel and group rows into style families
 *   2. For each style-family LEAD, download images and call Gemini Vision
 *      with a JSON schema constrained to MDD LOV values
 *   3. LOV-validate every extracted value
 *   4. Merge with seller text using per-attribute trust rules
 *      (image wins for color/pattern/neckline/sleeve/shape/length;
 *       seller wins for fabric/admin fields)
 *   5. Flag conflicts in _QA sheet for human review
 *
 * Falls back gracefully to text-only enrichment when GEMINI_API_KEY is missing
 * or when image downloads fail. One bad image never breaks the whole upload.
 */
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, type ParsedProduct } from '@/lib/excel';
import { enrichCatalog, getStyleFamilyLeads } from '@/lib/enrichment-engine';
import { buildEnrichmentWorkbook } from '@/lib/output-builder';
import { analyzeLeads } from '@/lib/vision-enrichment';
import { trackUsage } from '@/lib/usage-tracker';

export const runtime = 'nodejs';
// Vision calls can take 3-5s each, plus image download. For 50 style families
// that's ~5 minutes; we cap maxDuration at the Vercel max (300s on hobby/pro).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // ─── Read flags ──────────────────────────────────────────────────────
    const useImageInference = form.get('useImageInference') === 'true';
    const maxLeadsParam = Number(form.get('maxLeads') ?? '300');
    const maxLeads = isNaN(maxLeadsParam) ? 300 : Math.max(1, Math.min(1000, maxLeadsParam));

    // ─── Extract input file ──────────────────────────────────────────────
    let excelBuffer: ArrayBuffer | null = null;
    let excelFilename = 'catalog.xlsx';
    const zipFile = form.get('zip') as File | null;
    if (zipFile) {
      const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
          excelBuffer = await entry.async('arraybuffer');
          excelFilename = name.split('/').pop() ?? name;
          break;
        }
      }
    } else {
      const excelFile = form.get('excel') as File | null;
      if (excelFile) {
        excelBuffer = await excelFile.arrayBuffer();
        excelFilename = excelFile.name;
      }
    }

    if (!excelBuffer) {
      return NextResponse.json(
        { error: 'No Excel file found. Upload a .xlsx/.csv or a .zip containing one.' },
        { status: 400 },
      );
    }

    // ─── Parse ────────────────────────────────────────────────────────────
    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);
    if (products.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty or could not be parsed.' },
        { status: 400 },
      );
    }

    const slice = products.slice(0, 200);

    // ─── Vision pass (if enabled and API key set) ────────────────────────
    let visionMap = new Map<string, any>();
    let visionStats: any = null;
    let visionAttempted = false;

    if (useImageInference && process.env.GEMINI_API_KEY) {
      visionAttempted = true;
      const leads = getStyleFamilyLeads(slice);
      const result = await analyzeLeads(leads, { maxLeads });
      visionMap = result.visionMap;
      visionStats = result.stats;
    }

    // ─── Run MDD pipeline with vision attrs merged in ────────────────────
    const { enriched, report } = enrichCatalog(slice, {
      defaultSeason: 'SS26',
      startDate: formatDDMMYYYY(new Date()),
      endDate: '31-12-2099',
      imageInferenceAvailable: visionAttempted,
      visionAttrs: visionMap,
    });

    // ─── Build output workbook ───────────────────────────────────────────
    const buf = buildEnrichmentWorkbook(enriched, {
      includeQASheet: true,
      includeComplianceSheet: true,
      originalInputs: slice,
    });

    // ─── Usage tracking ──────────────────────────────────────────────────
    trackUsage({
      kind: 'catalog_enrich',
      engine: visionAttempted ? 'gemini' : 'rules',
      productCount: enriched.length,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: visionStats?.estimatedCostUsd ?? 0,
    });

    // ─── Build filename + headers ────────────────────────────────────────
    const filename = excelFilename.replace(/\.(xlsx|xls|csv)$/i, '') + '_vision_enriched.xlsx';
    const totalConflicts = enriched.reduce((s, e) => s + e.visionConflicts.length, 0);
    const visionEnrichedCount = enriched.filter((e) => e.visionEnriched).length;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Products-Processed': String(report.successfulRows),
        'X-Total-Rows': String(report.totalRows),
        'X-Average-Confidence': String(Math.round(report.averageConfidence * 100)),
        'X-Style-Families': String(report.styleFamiliesCount),
        'X-Needing-Review': String(report.rowsNeedingReview),
        'X-Engine': visionAttempted ? 'mdd-v3-vision' : 'mdd-v3-text',
        'X-Vision-Used': String(visionAttempted),
        'X-Vision-Leads-Analyzed': String(visionStats?.leadsSucceeded ?? 0),
        'X-Vision-Conflicts': String(totalConflicts),
        'X-Vision-Rows-Enriched': String(visionEnrichedCount),
        'X-Vision-Cost-Usd': String((visionStats?.estimatedCostUsd ?? 0).toFixed(4)),
      },
    });
  } catch (err: any) {
    console.error('[enrich-batch-v3] error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Enrichment failed' },
      { status: 500 },
    );
  }
}

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
