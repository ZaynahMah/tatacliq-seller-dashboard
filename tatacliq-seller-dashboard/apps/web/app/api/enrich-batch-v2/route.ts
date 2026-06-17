/**
 * v2 enrichment endpoint — produces MDD-compliant output matching Catalogus.ai.
 *
 * Returns the enriched XLSX with one sheet per L4 category, plus optional QA
 * and compliance sheets. Uses the new enrichment-engine pipeline.
 */
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { parseExcelBuffer, type ParsedProduct } from '@/lib/excel';
import { enrichCatalog } from '@/lib/enrichment-engine';
import { buildEnrichmentWorkbook } from '@/lib/output-builder';
import { trackUsage } from '@/lib/usage-tracker';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

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

    const products: ParsedProduct[] = parseExcelBuffer(excelBuffer);
    if (products.length === 0) {
      return NextResponse.json(
        { error: 'Excel file is empty or could not be parsed.' },
        { status: 400 },
      );
    }

    // Run the MDD-driven pipeline. Caps at 200 rows per request to keep latency reasonable.
    const slice = products.slice(0, 200);
    const { enriched, report } = enrichCatalog(slice, {
      defaultSeason: 'SS26',
      startDate: formatDDMMYYYY(new Date()),
      endDate: '31-12-2099',
    });

    const buf = buildEnrichmentWorkbook(enriched, {
      includeQASheet: true,
      includeComplianceSheet: true,
    });

    // Usage tracking. The MDD engine itself doesn't call Gemini (yet); image-based
    // refinement will be a follow-up. We log a "rules" engine event.
    trackUsage({
      kind: 'catalog_enrich',
      engine: 'rules',
      productCount: enriched.length,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    });

    const filename = excelFilename.replace(/\.(xlsx|xls|csv)$/i, '') + '_mdd_enriched.xlsx';
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
        'X-Engine': 'mdd-v2',
      },
    });
  } catch (err: any) {
    console.error('[enrich-batch-v2] error:', err);
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
