'use client';

import { useState, useRef } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import {
  Upload,
  FileSpreadsheet,
  ImageIcon,
  X,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Archive,
  Eye,
  Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// v2/v3 preview response — MDD-driven engine
interface ReportMetrics {
  generatedAt: string;
  model: string;
  confidenceThresholdPct: number;
  products: number;
  cellsScanned: number;
  issuesFound: number;
  autoFilled: number;
  flaggedForReview: number;
  groupConsensus: number;
  rowsErrored: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  estCostInr: number;
  costPerProductInr: number;
  goldenSheetUploaded: boolean;
}

interface EnrichedPreviewV2 {
  sku: string;
  styleCode: string;
  category: {
    l1: string; l2: string; l3: string; l4: string; displayName: string;
  };
  classification: { confidence: number; reason: string };
  isLead: boolean;
  leadVariantId: string;
  styleFamilySize: number;
  overallConfidence: number;
  missingMandatory: string[];
  enrichedHighlights: Record<string, string>;
  confidence: Record<string, number>;
  source: Record<string, string>;
  visionEnriched?: boolean;
  visionConflicts?: string[];
}

interface ReportV2 {
  totalRows: number;
  successfulRows: number;
  averageConfidence: number;
  byCategory: Record<string, number>;
  styleFamiliesCount: number;
  rowsNeedingReview: number;
}

interface VisionInfo {
  requested: boolean;
  attempted: boolean;
  apiKeyConfigured: boolean;
  rowsEnriched: number;
  conflictsFlagged: number;
  stats?: {
    leadsAttempted: number;
    leadsSucceeded: number;
    leadsFailed: number;
    totalImagesDownloaded: number;
    totalApiCalls: number;
    estimatedCostUsd: number;
    /** Real totals from Gemini's own usageMetadata — this is the number to
     *  show, not estimatedCostUsd, which is a flat per-call guess. */
    totalTokensIn?: number;
    totalTokensOut?: number;
    actualCostUsd?: number;
    failures: Array<{ sku: string; reason: string }>;
  };
  sampleExtractions?: Array<{
    sku: string;
    color_family?: string;
    pattern?: string;
    neck_collar?: string;
    sleeve?: string;
    dress_shape?: string;
    dress_length?: string;
    color_specific?: string;
    design_details?: string;
    visual_description?: string;
    confidence?: Record<string, number>;
    imagesAnalyzed?: number;
    error?: string;
  }>;
}

interface PreviewResponseV2 {
  totalProducts: number;
  processed: number;
  truncated: boolean;
  report: ReportV2;
  reportMetrics?: ReportMetrics;
  vision?: VisionInfo;
  products: EnrichedPreviewV2[];
}

export default function UploadPage() {
  const excelInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [phase, setPhase] = useState<'idle' | 'enriching' | 'ready' | 'error'>('idle');
  const [preview, setPreview] = useState<PreviewResponseV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('enriched.xlsx');
  const [expanded, setExpanded] = useState<number | null>(null);
  // Vision toggle — defaults ON. Server falls back gracefully when GEMINI_API_KEY
  // is missing, so leaving this on doesn't break uploads in dev.
  const [useImageInference, setUseImageInference] = useState(true);

  const hasInput = excelFile || zipFile;

  async function runEnrichment() {
    if (!hasInput) return;
    setPhase('enriching');
    setError(null);
    setPreview(null);
    setDownloadBlob(null);

    const form = new FormData();
    if (zipFile) {
      form.append('zip', zipFile);
    } else if (excelFile) {
      form.append('excel', excelFile);
      for (const img of imageFiles) form.append('images', img);
    }
    form.append('useImageInference', String(useImageInference));

    try {
      // Step 1: get JSON preview (MDD engine v3 with Vision)
      const previewRes = await fetch('/api/enrich-preview-v3', { method: 'POST', body: form });
      if (!previewRes.ok) {
        const j = await previewRes.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${previewRes.status}`);
      }
      const previewData: PreviewResponseV2 = await previewRes.json();
      setPreview(previewData);

      // Step 2: build downloadable MDD-compliant workbook
      const form2 = new FormData();
      if (zipFile) form2.append('zip', zipFile);
      else if (excelFile) {
        form2.append('excel', excelFile);
        for (const img of imageFiles) form2.append('images', img);
      }
      form2.append('useImageInference', String(useImageInference));
      const fileRes = await fetch('/api/enrich-batch-v3', { method: 'POST', body: form2 });
      if (!fileRes.ok) throw new Error('Failed to build downloadable file');
      const blob = await fileRes.blob();
      setDownloadBlob(blob);
      const cd = fileRes.headers.get('Content-Disposition') ?? '';
      const m = cd.match(/filename="(.+?)"/);
      const filename = m?.[1] ?? 'mdd_enriched.xlsx';
      setDownloadFilename(filename);

      setPhase('ready');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
      setPhase('error');
    }
  }

  function downloadFile() {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setExcelFile(null);
    setImageFiles([]);
    setZipFile(null);
    setPreview(null);
    setDownloadBlob(null);
    setError(null);
    setPhase('idle');
    setExpanded(null);
  }

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <PageHeader
          title="Upload & Enrich"
          subtitle="Drop a seller's Excel catalog (with optional images), and download the enriched, portal-ready version."
        />

        {phase === 'idle' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Option A: ZIP */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="pill bg-magenta-100 text-magenta-700 text-[10px]">Recommended</div>
                  <h3 className="font-semibold text-ink-900 dark:text-white">Upload a ZIP</h3>
                </div>
                <p className="text-sm text-ink-500 mb-4">
                  Single ZIP containing the Excel catalog + product images (named by SKU).
                </p>
                <DropZone
                  onFiles={(files) => setZipFile(files[0])}
                  accept=".zip"
                  icon={<Archive className="w-7 h-7" />}
                  label="Drop a .zip here"
                  hint="Excel + images bundled together"
                  inputRef={zipInputRef}
                />
                {zipFile && (
                  <FileChip
                    icon={<Archive className="w-4 h-4 text-magenta-600" />}
                    name={zipFile.name}
                    size={zipFile.size}
                    onRemove={() => setZipFile(null)}
                  />
                )}
              </Card>

              <div className="text-center text-xs uppercase tracking-wide text-ink-400 font-medium">
                — or upload separately —
              </div>

              {/* Option B: separate excel + images */}
              <Card className="p-6">
                <h3 className="font-semibold text-ink-900 dark:text-white mb-1">Excel catalog</h3>
                <p className="text-sm text-ink-500 mb-3">.xlsx, .xls, or .csv from the seller</p>
                <DropZone
                  onFiles={(files) => setExcelFile(files[0])}
                  accept=".xlsx,.xls,.csv"
                  icon={<FileSpreadsheet className="w-7 h-7" />}
                  label="Drop your Excel here"
                  hint="One file"
                  inputRef={excelInputRef}
                  disabled={!!zipFile}
                />
                {excelFile && (
                  <FileChip
                    icon={<FileSpreadsheet className="w-4 h-4 text-royal-600" />}
                    name={excelFile.name}
                    size={excelFile.size}
                    onRemove={() => setExcelFile(null)}
                  />
                )}
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-ink-900 dark:text-white mb-1">
                  Product images <span className="text-ink-400 font-normal">(optional)</span>
                </h3>
                <p className="text-sm text-ink-500 mb-3">
                  Name files by SKU (e.g. <code className="text-xs bg-ink-100 dark:bg-ink-800 px-1 rounded">LFH-KRT-001.jpg</code>) for auto-matching.
                </p>
                <DropZone
                  onFiles={(files) => setImageFiles((prev) => [...prev, ...files])}
                  accept="image/*"
                  multiple
                  icon={<ImageIcon className="w-7 h-7" />}
                  label="Drop images here"
                  hint="JPG, PNG, WebP — multiple OK"
                  inputRef={imagesInputRef}
                  disabled={!!zipFile}
                />
                {imageFiles.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {imageFiles.map((f, i) => (
                      <FileChip
                        key={i}
                        icon={<ImageIcon className="w-4 h-4 text-magenta-600" />}
                        name={f.name}
                        size={f.size}
                        onRemove={() => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        compact
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="p-5 sticky top-6">
                <h3 className="font-semibold text-ink-900 dark:text-white mb-3">Ready to enrich?</h3>
                <div className="space-y-2 text-sm mb-4">
                  <StatusRow label="Excel" done={!!(excelFile || zipFile)} />
                  <StatusRow label="Images" done={imageFiles.length > 0 || !!zipFile} optional />
                </div>

                {/* Vision toggle */}
                <label className="flex items-start gap-3 p-3 rounded-lg border border-royal-200 bg-royal-50/40 dark:border-royal-900/40 dark:bg-royal-950/20 mb-4 cursor-pointer hover:bg-royal-50/60 transition">
                  <input
                    type="checkbox"
                    checked={useImageInference}
                    onChange={(e) => setUseImageInference(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-royal-600"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-900 dark:text-white">
                      Use image inference (Gemini Vision)
                    </div>
                    <div className="text-[11px] text-ink-600 dark:text-ink-400 mt-0.5 leading-relaxed">
                      Downloads product images and uses Gemini 2.5 Flash to extract color, pattern, neckline, sleeve, dress shape & length directly from photos. One call per style family.
                    </div>
                    <div className="text-[11px] text-royal-700 dark:text-royal-400 mt-1 font-mono">
                      ~$0.001 per style family · LOV-constrained · conflict-flagged
                    </div>
                  </div>
                </label>

                <button
                  onClick={runEnrichment}
                  disabled={!hasInput}
                  className="w-full btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {useImageInference ? 'Run Enrichment with Vision' : 'Run Enrichment (text only)'}
                </button>
                <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">
                  Up to 200 products per upload. Vision requires <code className="bg-ink-100 dark:bg-ink-800 px-1 rounded">GEMINI_API_KEY</code> in env; falls back to text-only enrichment gracefully when unset.
                </p>
              </Card>

              <Card className="p-5">
                <h4 className="text-sm font-semibold text-ink-900 dark:text-white mb-2">
                  How matching works
                </h4>
                <ul className="text-xs text-ink-600 dark:text-ink-400 space-y-1.5 leading-relaxed">
                  <li>• Excel rows → products (one row = one product)</li>
                  <li>• Images matched by filename containing the SKU</li>
                  <li>• AI fills 30+ portal fields (HSN, fabric, sleeve, etc.)</li>
                  <li>• Never cross-references Tata CLiQ</li>
                </ul>
              </Card>
            </div>
          </div>
        )}

        {phase === 'enriching' && (
          <Card className="p-12 text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-royal-500 to-magenta-500 text-white mb-4">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-xl font-display font-semibold text-ink-900 dark:text-white">
              Enriching your catalog...
            </h3>
            <p className="text-sm text-ink-500 mt-2">
              Parsing rows, matching images, calling Gemini, building master sheet. Usually 10-30s.
            </p>
            <div className="mt-6 flex justify-center gap-2 text-xs text-ink-500">
              <Step label="Parse" active />
              <Step label="Match images" active />
              <Step label="Enrich" active />
              <Step label="Generate" />
            </div>
          </Card>
        )}

        {phase === 'error' && (
          <Card className="p-8 max-w-2xl mx-auto border-red-200 bg-red-50/40 dark:bg-red-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-ink-900 dark:text-white">Enrichment failed</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
                <button onClick={reset} className="btn-outline mt-4">
                  Try again
                </button>
              </div>
            </div>
          </Card>
        )}

        {phase === 'ready' && preview && (
          <div className="space-y-5">
            {/* Success banner */}
            <Card className="p-5 border-green-200 bg-gradient-to-r from-green-50/60 to-royal-50/60 dark:from-green-950/20 dark:to-royal-950/20">
              <div className="flex items-center gap-4">
                <div className="flex w-11 h-11 items-center justify-center rounded-xl bg-green-600 text-white shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-ink-900 dark:text-white">
                    Enriched {preview.processed} of {preview.totalProducts} products
                    {preview.truncated && (
                      <span className="ml-2 text-xs text-amber-600">
                        (capped at 30 in preview — full file has all rows)
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ink-600 dark:text-ink-300 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Avg confidence: <b className="text-green-700">{Math.round(preview.report.averageConfidence * 100)}%</b></span>
                    <span>Style families: <b>{preview.report.styleFamiliesCount}</b></span>
                    <span>Need review: <b className={preview.report.rowsNeedingReview ? 'text-amber-600' : 'text-green-700'}>{preview.report.rowsNeedingReview}</b></span>
                    <span>Engine: <b className="text-royal-700">{preview.vision?.attempted ? 'MDD v3 + Vision' : 'MDD v3 (text)'}</b></span>
                  </div>
                </div>
                <button onClick={downloadFile} className="btn-primary !px-5 shrink-0">
                  <Download className="w-4 h-4" />
                  Download .xlsx
                </button>
                <button onClick={reset} className="btn-outline shrink-0">
                  New batch
                </button>
              </div>
            </Card>

            {/* Report — cost & metrics summary (matches the requested format) */}
            {preview.reportMetrics && (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex w-9 h-9 items-center justify-center rounded-lg bg-magenta-100 text-magenta-700 dark:bg-magenta-950/40 dark:text-magenta-300 shrink-0">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-ink-900 dark:text-white">
                        Report{excelFile ? <> — <span className="text-ink-700 dark:text-ink-200 font-normal">{excelFile.name}</span></> : null}
                      </h3>
                      <div className="text-xs text-ink-500 mt-0.5">
                        {new Date(preview.reportMetrics.generatedAt).toLocaleString('en-IN', {
                          day: 'numeric', month: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
                        })}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5">
                        Model <b className="text-ink-700 dark:text-ink-200 font-mono">{preview.reportMetrics.model}</b>
                        {' · '}
                        confidence threshold <b className="text-ink-700 dark:text-ink-200">{preview.reportMetrics.confidenceThresholdPct}%</b>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const m = preview.reportMetrics!;
                      const tsLocal = new Date(m.generatedAt).toLocaleString('en-IN', {
                        day: 'numeric', month: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
                      });
                      const txt = [
                        `Report — ${excelFile?.name ?? 'enriched.xlsx'}`,
                        tsLocal,
                        `Model ${m.model} · confidence threshold ${m.confidenceThresholdPct}%`,
                        ``,
                        `Products\t${m.products}`,
                        `Cells scanned\t${m.cellsScanned}`,
                        `Issues found\t${m.issuesFound}`,
                        `Auto-filled\t${m.autoFilled}`,
                        `Flagged for review\t${m.flaggedForReview}`,
                        `Group-consensus\t${m.groupConsensus} filled/fixed`,
                        `Rows errored\t${m.rowsErrored}`,
                        `Input tokens\t${m.inputTokens.toLocaleString()}`,
                        `Output tokens\t${m.outputTokens.toLocaleString()}`,
                        `Est. cost (USD)\t$${m.estCostUsd.toFixed(4)}`,
                        `Est. cost (INR)\t₹${m.estCostInr.toFixed(2)}`,
                        `Cost / product\t₹${m.costPerProductInr.toFixed(3)}`,
                        ``,
                        m.goldenSheetUploaded
                          ? ''
                          : 'No golden sheet uploaded — accuracy scoring skipped. Token usage and cost still apply.',
                      ].filter(Boolean).join('\n');
                      navigator.clipboard?.writeText(txt);
                    }}
                    className="text-xs px-3 py-1.5 rounded-md border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 shrink-0"
                    title="Copy report to clipboard"
                  >
                    Copy
                  </button>
                </div>

                {/* Volume + Issues block */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                  <ReportStat label="Products" value={preview.reportMetrics.products} />
                  <ReportStat label="Cells scanned" value={preview.reportMetrics.cellsScanned} />
                  <ReportStat
                    label="Issues found"
                    value={preview.reportMetrics.issuesFound}
                    tone={preview.reportMetrics.issuesFound > 0 ? 'amber' : 'neutral'}
                  />
                  <ReportStat
                    label="Auto-filled"
                    value={preview.reportMetrics.autoFilled}
                    tone="green"
                  />
                  <ReportStat
                    label="Flagged for review"
                    value={preview.reportMetrics.flaggedForReview}
                    tone={preview.reportMetrics.flaggedForReview > 0 ? 'amber' : 'green'}
                  />
                  <ReportStat
                    label="Group-consensus"
                    value={<>{preview.reportMetrics.groupConsensus} <span className="text-xs font-normal text-ink-500">filled/fixed</span></>}
                  />
                  <ReportStat
                    label="Rows errored"
                    value={preview.reportMetrics.rowsErrored}
                    tone={preview.reportMetrics.rowsErrored > 0 ? 'red' : 'green'}
                  />
                </div>

                {/* Cost block — the focal point of the card */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 rounded-lg bg-ink-50 dark:bg-ink-900/40">
                  <CostStat label="Input tokens" value={preview.reportMetrics.inputTokens.toLocaleString()} />
                  <CostStat label="Output tokens" value={preview.reportMetrics.outputTokens.toLocaleString()} />
                  <CostStat
                    label="Est. cost (USD)"
                    value={`$${preview.reportMetrics.estCostUsd.toFixed(4)}`}
                    emphasize
                  />
                  <CostStat
                    label="Est. cost (INR)"
                    value={`₹${preview.reportMetrics.estCostInr.toFixed(2)}`}
                    emphasize
                  />
                  <CostStat
                    label="Cost / product"
                    value={`₹${preview.reportMetrics.costPerProductInr.toFixed(3)}`}
                  />
                </div>

                {!preview.reportMetrics.goldenSheetUploaded && (
                  <div className="text-xs text-ink-500 mt-3 italic">
                    No golden sheet uploaded — accuracy scoring skipped. Token usage and cost still apply.
                  </div>
                )}
              </Card>
            )}

            {/* Vision stats panel */}
            {preview.vision && (preview.vision.requested || preview.vision.attempted) && (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-ink-900 dark:text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-magenta-600" />
                      Image inference (Gemini 2.5 Flash Vision)
                    </h3>
                    <p className="text-xs text-ink-500 mt-1">
                      Vision analyzes one image per style family lead and merges with seller text via per-attribute trust rules.
                    </p>
                  </div>
                  {!preview.vision.apiKeyConfigured && (
                    <div className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-medium">
                      GEMINI_API_KEY not set — Vision skipped
                    </div>
                  )}
                </div>

                {preview.vision.attempted && preview.vision.stats && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                      <div className="p-3 rounded-lg bg-magenta-50 dark:bg-magenta-950/30">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500">Leads analyzed</div>
                        <div className="text-lg font-semibold text-magenta-700">{preview.vision.stats.leadsSucceeded}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-magenta-50 dark:bg-magenta-950/30">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500">Rows enriched</div>
                        <div className="text-lg font-semibold text-magenta-700">{preview.vision.rowsEnriched}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-magenta-50 dark:bg-magenta-950/30">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500">Conflicts flagged</div>
                        <div className={cn('text-lg font-semibold', preview.vision.conflictsFlagged > 0 ? 'text-amber-600' : 'text-green-700')}>
                          {preview.vision.conflictsFlagged}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-magenta-50 dark:bg-magenta-950/30">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500">Failures</div>
                        <div className={cn('text-lg font-semibold', preview.vision.stats.leadsFailed > 0 ? 'text-red-600' : 'text-green-700')}>
                          {preview.vision.stats.leadsFailed}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-magenta-50 dark:bg-magenta-950/30">
                        <div className="text-[10px] uppercase tracking-wider text-ink-500">Real cost (actual tokens)</div>
                        <div className="text-lg font-semibold text-magenta-700 font-mono">
                          ${(preview.vision.stats.actualCostUsd ?? preview.vision.stats.estimatedCostUsd).toFixed(4)}
                        </div>
                        {preview.vision.stats.totalTokensIn !== undefined && (
                          <div className="text-[10px] text-ink-500 mt-0.5">
                            {preview.vision.stats.totalTokensIn.toLocaleString()} in / {preview.vision.stats.totalTokensOut?.toLocaleString()} out
                            {preview.vision.stats.leadsSucceeded > 0 && (
                              <> · ${((preview.vision.stats.actualCostUsd ?? 0) / preview.vision.stats.leadsSucceeded).toFixed(5)}/row</>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sample extractions */}
                    {preview.vision.sampleExtractions && preview.vision.sampleExtractions.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800">
                        <div className="text-xs font-medium text-ink-700 dark:text-ink-300 mb-2">
                          Sample Vision extractions
                        </div>
                        <div className="space-y-2">
                          {preview.vision.sampleExtractions.map((s) => (
                            <div key={s.sku} className="text-xs p-3 rounded-lg bg-ink-50 dark:bg-ink-900/40">
                              <div className="font-mono text-ink-700 dark:text-ink-300 mb-1">{s.sku}</div>
                              {s.error ? (
                                <div className="text-red-600">Error: {s.error}</div>
                              ) : (
                                <>
                                  <div className="text-ink-600 dark:text-ink-400 italic mb-1.5">
                                    "{s.visual_description}"
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.color_family && <Pill>color: {s.color_family}{s.color_specific ? ` (${s.color_specific})` : ''}</Pill>}
                                    {s.pattern && <Pill>pattern: {s.pattern}</Pill>}
                                    {s.neck_collar && <Pill>neck: {s.neck_collar}</Pill>}
                                    {s.sleeve && <Pill>sleeve: {s.sleeve}</Pill>}
                                    {s.dress_shape && <Pill>shape: {s.dress_shape}</Pill>}
                                    {s.dress_length && <Pill>length: {s.dress_length}</Pill>}
                                  </div>
                                  {s.design_details && (
                                    <div className="text-ink-500 mt-1.5">
                                      <span className="text-[10px] uppercase tracking-wider">Design: </span>
                                      {s.design_details}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Failures detail */}
                    {preview.vision.stats.failures.length > 0 && (
                      <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40">
                        <div className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                          Vision failures ({preview.vision.stats.failures.length})
                        </div>
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 font-mono space-y-0.5">
                          {preview.vision.stats.failures.slice(0, 5).map((f) => (
                            <div key={f.sku}>{f.sku}: {f.reason}</div>
                          ))}
                          {preview.vision.stats.failures.length > 5 && (
                            <div>... and {preview.vision.stats.failures.length - 5} more</div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Category distribution */}
            {Object.keys(preview.report.byCategory).length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-ink-900 dark:text-white mb-3">Classified into</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(preview.report.byCategory).map(([l4, count]) => (
                    <div key={l4} className="pill bg-royal-50 dark:bg-royal-950/40 text-royal-700 dark:text-royal-300">
                      {l4} <span className="ml-1.5 font-mono text-[10px] opacity-70">×{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Per-product preview */}
            <Card>
              <div className="px-5 pt-5 pb-3 border-b border-ink-100 dark:border-ink-800">
                <h3 className="font-semibold text-ink-900 dark:text-white">Enriched products preview</h3>
                <p className="text-sm text-ink-500 mt-0.5">Click a row to see all enriched fields, sources, and confidence scores.</p>
              </div>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {preview.products.map((p, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      className="w-full p-4 flex items-center gap-4 hover:bg-ink-50 dark:hover:bg-ink-900/50 text-left transition"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-royal-100 to-magenta-100 dark:from-royal-950/50 dark:to-magenta-950/50 flex items-center justify-center text-[10px] font-mono font-semibold text-royal-700">
                        {p.isLead ? 'LEAD' : 'VAR'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink-900 dark:text-white truncate">
                          {p.enrichedHighlights.title || '(no title)'}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-ink-500 flex-wrap">
                          <span className="font-mono">{p.sku}</span>
                          <span>·</span>
                          <span>{p.category.l4}</span>
                          {p.styleFamilySize > 1 && (
                            <>
                              <span>·</span>
                              <span>family of {p.styleFamilySize}</span>
                            </>
                          )}
                          {p.missingMandatory.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {p.missingMandatory.length} missing
                              </span>
                            </>
                          )}
                          {p.visionEnriched && (
                            <>
                              <span>·</span>
                              <span className="text-magenta-600 flex items-center gap-1">
                                <ImageIcon className="w-3 h-3" />
                                vision
                              </span>
                            </>
                          )}
                          {p.visionConflicts && p.visionConflicts.length > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-magenta-700 font-medium">
                                {p.visionConflicts.length} conflict{p.visionConflicts.length > 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ConfidenceBadge value={Math.round(p.overallConfidence * 100)} />
                      <Eye className={cn('w-4 h-4 text-ink-400 transition', expanded === i && 'rotate-90')} />
                    </button>
                    {expanded === i && (
                      <div className="px-5 pb-5 bg-ink-50/50 dark:bg-ink-900/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3">
                          {Object.entries(p.enrichedHighlights).map(([k, v]) => (
                            <FieldRow
                              key={k}
                              label={k}
                              value={v}
                              confidence={p.confidence[k]}
                              source={p.source[k]}
                            />
                          ))}
                        </div>
                        {p.missingMandatory.length > 0 && (
                          <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40">
                            <div className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
                              Missing mandatory MDD fields
                            </div>
                            <div className="text-xs text-amber-700 dark:text-amber-400 font-mono">
                              {p.missingMandatory.join(', ')}
                            </div>
                          </div>
                        )}
                        {p.visionConflicts && p.visionConflicts.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg border border-magenta-200 bg-magenta-50 dark:bg-magenta-950/20 dark:border-magenta-900/40">
                            <div className="text-xs font-medium text-magenta-800 dark:text-magenta-300 mb-1.5 flex items-center gap-1.5">
                              <ImageIcon className="w-3 h-3" />
                              Vision vs seller conflicts ({p.visionConflicts.length})
                            </div>
                            <div className="text-[11px] text-magenta-700 dark:text-magenta-400 space-y-0.5">
                              {p.visionConflicts.map((c, i) => (
                                <div key={i} className="font-mono">{c}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="mt-3 text-xs text-ink-500">
                          <span className="font-medium">Classified:</span> {p.category.l1} › {p.category.l2} › {p.category.l3} › <b className="text-ink-700 dark:text-ink-200">{p.category.l4}</b>
                          {' '}<span className="text-ink-400">({Math.round(p.classification.confidence * 100)}% — {p.classification.reason})</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

// ===== Helper components =====

function DropZone({
  onFiles,
  accept,
  multiple,
  icon,
  label,
  hint,
  inputRef,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  inputRef: React.RefObject<HTMLInputElement>;
  disabled?: boolean;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (disabled) return;
        if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        'relative rounded-xl border-2 border-dashed p-8 text-center transition',
        disabled
          ? 'opacity-40 cursor-not-allowed border-ink-200 dark:border-ink-800'
          : 'cursor-pointer hover:border-royal-400 hover:bg-royal-50/40 dark:hover:bg-royal-950/20',
        active && !disabled
          ? 'border-royal-500 bg-royal-50 dark:bg-royal-950/30'
          : 'border-ink-200 dark:border-ink-700',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <div className="flex flex-col items-center gap-2 text-ink-600 dark:text-ink-300">
        <div className="text-royal-600">{icon}</div>
        <div className="font-medium text-ink-900 dark:text-white">{label}</div>
        <div className="text-xs text-ink-500">{hint}</div>
      </div>
    </div>
  );
}

function FileChip({
  icon,
  name,
  size,
  onRemove,
  compact,
}: {
  icon: React.ReactNode;
  name: string;
  size: number;
  onRemove: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'mt-3 flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900',
        compact ? 'p-2 mt-0' : 'p-3',
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-ink-900 dark:text-white truncate">{name}</div>
        <div className="text-[10px] text-ink-500">{(size / 1024).toFixed(0)} KB</div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-ink-400 hover:text-red-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function StatusRow({ label, done, optional }: { label: string; done: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-700 dark:text-ink-200">
        {label} {optional && <span className="text-ink-400 text-xs">(optional)</span>}
      </span>
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-green-600" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-ink-300 dark:border-ink-600" />
      )}
    </div>
  );
}

function Step({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium',
        active ? 'bg-royal-100 text-royal-700 dark:bg-royal-900/40 dark:text-royal-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800',
      )}
    >
      {label}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const color =
    value >= 90 ? 'bg-green-100 text-green-700' : value >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={cn('pill text-[10px] font-mono', color)}>{value}%</span>;
}

/** Single metric tile used in the Report card. */
function ReportStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red';
}) {
  const toneClass =
    tone === 'green' ? 'text-green-700 dark:text-green-400'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'red' ? 'text-red-600 dark:text-red-400'
    : 'text-ink-800 dark:text-white';
  return (
    <div className="p-3 rounded-lg border border-ink-100 dark:border-ink-800 bg-white/40 dark:bg-ink-900/30">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={cn('text-lg font-semibold mt-0.5', toneClass)}>{value}</div>
    </div>
  );
}

/** Cost tile — more compact, emphasizes monetary values. */
function CostStat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="px-1">
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={cn(
        'mt-0.5 font-mono tabular-nums',
        emphasize ? 'text-base font-semibold text-magenta-700 dark:text-magenta-300' : 'text-sm font-medium text-ink-800 dark:text-ink-100',
      )}>
        {value}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-magenta-100 text-magenta-800 dark:bg-magenta-950/50 dark:text-magenta-300">
      {children}
    </span>
  );
}

function FieldRow({ label, value, confidence, source }: {
  label: string; value: string; confidence?: number; source?: string;
}) {
  if (!value) return null;
  const confPct = confidence !== undefined ? Math.round(confidence * 100) : undefined;
  const confColor =
    confPct === undefined ? '' :
    confPct >= 85 ? 'text-green-600' :
    confPct >= 70 ? 'text-amber-600' : 'text-red-600';
  const sourceLabel = source ? {
    seller: 'from seller',
    normalized: 'normalized',
    inferred: 'inferred',
    generated: 'AI-generated',
    image: 'from image',
  }[source] ?? source : undefined;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 font-medium flex items-center gap-2">
        <span>{label.replace(/_/g, ' ')}</span>
        {confPct !== undefined && (
          <span className={cn('font-mono', confColor)}>{confPct}%</span>
        )}
        {sourceLabel && (
          <span className="text-ink-400 normal-case font-normal text-[10px]">· {sourceLabel}</span>
        )}
      </div>
      <div className="text-sm text-ink-900 dark:text-ink-100 mt-0.5 break-words">{value}</div>
    </div>
  );
}
