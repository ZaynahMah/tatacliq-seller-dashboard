'use client';

import { useState, useRef, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import {
  Sparkles,
  Download,
  RotateCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Camera,
  Maximize2,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnhanceResponse {
  ok: true;
  enhancedDataUrl: string;
  originalDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  subjectBox: { x: number; y: number; w: number; h: number };
  cropRisk: { head: number; hands: number; feet: number; garment: number };
  engine: 'gemini' | 'sharp-fallback';
  notes: string[];
}

interface Preset {
  label: string;
  width: number;
  height: number;
  badge?: string;
  description: string;
}

const PRESETS: Preset[] = [
  { label: 'Portrait 3:4', width: 1080, height: 1440, badge: 'Marketplace', description: 'Myntra, Ajio, Amazon Fashion' },
  { label: 'Portrait 4:5', width: 1080, height: 1350, badge: 'Social', description: 'Instagram feed' },
  { label: 'Square 1:1', width: 1080, height: 1080, description: 'Universal listing thumb' },
  { label: 'Landscape 16:9', width: 1920, height: 1080, description: 'Banner, hero, web' },
  { label: 'Story 9:16', width: 1080, height: 1920, description: 'Reels, Stories, Shorts' },
];

export default function StudioPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [presetIdx, setPresetIdx] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1440);
  const [productContext, setProductContext] = useState('');
  const [enhanceMode, setEnhanceMode] = useState<'smart_fit' | 'extend_background' | 'white_studio' | 'marketplace_portrait' | 'pure_white' | 'pure_black'>('pure_white');

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EnhanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const targetW = customMode ? customW : PRESETS[presetIdx].width;
  const targetH = customMode ? customH : PRESETS[presetIdx].height;

  function pickFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(f);
    setImagePreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function runEnhancement() {
    if (!imageFile) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', imageFile);
      form.append('width', String(targetW));
      form.append('height', String(targetH));
      form.append('mode', enhanceMode);
      if (productContext) form.append('productContext', productContext);

      const r = await fetch('/api/enhance-image', { method: 'POST', body: form });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const data: EnhanceResponse = await r.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? 'Enhancement failed');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.enhancedDataUrl;
    const base = imageFile?.name.replace(/\.[^.]+$/, '') ?? 'enhanced';
    a.download = `${base}_${result.targetWidth}x${result.targetHeight}.jpg`;
    a.click();
  }

  function reset() {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setResult(null);
    setError(null);
  }

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="AI Image Studio"
          subtitle="Resize product photos to any aspect ratio without cropping the subject. AI fills the new space — no white padding, ever."
        />

        {!imageFile && (
          <Card className="p-10">
            <DropZone onFiles={pickFile} inputRef={fileInputRef} />
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-500">
              <FeatureChip label="Preserves heads, hands, feet" />
              <FeatureChip label="No white padding" />
              <FeatureChip label="AI background extension" />
              <FeatureChip label="Garment-safe scaling" />
            </div>
          </Card>
        )}

        {imageFile && !result && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wide text-ink-500 font-medium">Source</div>
                <button onClick={reset} className="text-ink-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-xl overflow-hidden bg-ink-100 dark:bg-ink-900 aspect-square flex items-center justify-center">
                {imagePreviewUrl && (
                  <img src={imagePreviewUrl} alt="source" className="w-full h-full object-contain" />
                )}
              </div>
              <div className="mt-3 text-xs text-ink-500 truncate">{imageFile.name}</div>
              <div className="text-[11px] text-ink-400 mt-0.5">
                {(imageFile.size / 1024).toFixed(0)} KB
              </div>
            </Card>

            <Card className="lg:col-span-3 p-6">
              <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white mb-1">
                What dimensions do you want this image in?
              </h3>
              <p className="text-sm text-ink-500 mb-5">
                Pick a preset — the AI will preserve your subject and extend the background to match.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setPresetIdx(i);
                      setCustomMode(false);
                    }}
                    className={cn(
                      'group relative text-left rounded-xl border-2 p-3 transition',
                      !customMode && presetIdx === i
                        ? 'border-royal-500 bg-royal-50 dark:bg-royal-950/40 shadow-soft'
                        : 'border-ink-200 dark:border-ink-700 hover:border-royal-300',
                    )}
                  >
                    {p.badge && (
                      <span className="absolute top-2 right-2 pill text-[9px] bg-magenta-100 text-magenta-700">
                        {p.badge}
                      </span>
                    )}
                    <AspectIcon w={p.width} h={p.height} active={!customMode && presetIdx === i} />
                    <div className="mt-2 text-sm font-semibold text-ink-900 dark:text-white">
                      {p.label}
                    </div>
                    <div className="text-[11px] text-ink-500 tabular-nums">
                      {p.width} × {p.height}
                    </div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{p.description}</div>
                  </button>
                ))}

                <button
                  onClick={() => setCustomMode(true)}
                  className={cn(
                    'rounded-xl border-2 p-3 text-left transition',
                    customMode
                      ? 'border-royal-500 bg-royal-50 dark:bg-royal-950/40'
                      : 'border-dashed border-ink-300 dark:border-ink-700 hover:border-royal-400',
                  )}
                >
                  <Maximize2 className="w-5 h-5 text-royal-600 mb-2" />
                  <div className="text-sm font-semibold text-ink-900 dark:text-white">Custom</div>
                  <div className="text-[11px] text-ink-500">Set your own dimensions</div>
                </button>
              </div>

              {customMode && (
                <div className="mb-5 rounded-xl border border-ink-200 dark:border-ink-700 p-4 bg-ink-50/60 dark:bg-ink-900/40">
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label="Width (px)" value={customW} onChange={setCustomW} min={200} max={4096} />
                    <NumberField label="Height (px)" value={customH} onChange={setCustomH} min={200} max={4096} />
                  </div>
                </div>
              )}

              <div className="mb-5">
                <label className="text-xs uppercase tracking-wide text-ink-500 font-medium block mb-2">
                  Background mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <ModeCard
                    active={enhanceMode === 'pure_white'}
                    onClick={() => setEnhanceMode('pure_white')}
                    title="Pure White"
                    desc="#FFFFFF • marketplace cutout"
                    swatch="bg-white border border-ink-200"
                  />
                  <ModeCard
                    active={enhanceMode === 'pure_black'}
                    onClick={() => setEnhanceMode('pure_black')}
                    title="Pure Black"
                    desc="#000000 • editorial cutout"
                    swatch="bg-black"
                  />
                  <ModeCard
                    active={enhanceMode === 'white_studio'}
                    onClick={() => setEnhanceMode('white_studio')}
                    title="White Studio"
                    desc="Soft white gradient"
                    swatch="bg-gradient-to-b from-white to-ink-100"
                  />
                  <ModeCard
                    active={enhanceMode === 'marketplace_portrait'}
                    onClick={() => setEnhanceMode('marketplace_portrait')}
                    title="Marketplace Portrait"
                    desc="Neutral warm Myntra-style"
                    swatch="bg-gradient-to-b from-sand-100 to-sand-300"
                  />
                  <ModeCard
                    active={enhanceMode === 'smart_fit'}
                    onClick={() => setEnhanceMode('smart_fit')}
                    title="Smart Fit"
                    desc="Extend background naturally"
                    swatch="bg-gradient-to-br from-sky-100 to-royal-100"
                  />
                  <ModeCard
                    active={enhanceMode === 'extend_background'}
                    onClick={() => setEnhanceMode('extend_background')}
                    title="Extend Background"
                    desc="Show more environment"
                    swatch="bg-gradient-to-br from-blush-100 to-magenta-100"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="text-xs uppercase tracking-wide text-ink-500 font-medium block mb-1.5">
                  Product context <span className="text-ink-400 normal-case">(optional, improves AI)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. women's mustard anarkali kurta on female model"
                  value={productContext}
                  onChange={(e) => setProductContext(e.target.value)}
                  className="input-field"
                />
              </div>

              <button
                onClick={runEnhancement}
                disabled={busy}
                className="w-full btn-primary justify-center text-base !py-3 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enhancing — preserving subject...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Enhance to {targetW} × {targetH}
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
              )}
            </Card>
          </div>
        )}

        {result && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-600 text-white">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-semibold text-lg text-ink-900 dark:text-white">
                    Enhanced to {result.targetWidth} × {result.targetHeight}
                  </div>
                  <div className="text-sm text-ink-500">
                    Engine:{' '}
                    <span className={cn('font-medium', result.engine === 'gemini' ? 'text-royal-700' : 'text-ink-700')}>
                      {result.engine === 'gemini' ? 'Gemini 2.5 Flash Image (Nano Banana)' : 'Smart canvas (no API key)'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={runEnhancement} disabled={busy} className="btn-outline">
                  <RotateCw className={cn('w-4 h-4', busy && 'animate-spin')} />
                  Regenerate
                </button>
                <button onClick={download} className="btn-primary">
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button onClick={reset} className="btn-ghost">
                  New image
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-medium">Before</div>
                  <span className="text-[11px] text-ink-400 tabular-nums">
                    {result.originalWidth} × {result.originalHeight}
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden bg-checker">
                  <img src={result.originalDataUrl} alt="before" className="w-full h-auto" />
                </div>
              </Card>

              <Card className="p-5 border-royal-200 ring-1 ring-royal-200/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wide text-royal-700 dark:text-royal-300 font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> After
                  </div>
                  <span className="text-[11px] text-ink-400 tabular-nums">
                    {result.targetWidth} × {result.targetHeight}
                  </span>
                </div>
                <div className="rounded-xl overflow-hidden bg-checker">
                  <img src={result.enhancedDataUrl} alt="after" className="w-full h-auto" />
                </div>
              </Card>
            </div>

            <Card className="p-5">
              <h4 className="font-display font-semibold text-ink-900 dark:text-white mb-3">
                Crop-risk detection
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <RiskMeter label="Head" value={result.cropRisk.head} />
                <RiskMeter label="Hands" value={result.cropRisk.hands} />
                <RiskMeter label="Feet" value={result.cropRisk.feet} />
                <RiskMeter label="Garment" value={result.cropRisk.garment} />
              </div>
              {result.notes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800 space-y-1">
                  {result.notes.map((n, i) => (
                    <div key={i} className="text-xs text-ink-500 flex items-start gap-2">
                      <span className="text-royal-500 mt-0.5">•</span> {n}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      <style jsx>{`
        .bg-checker {
          background-image:
            linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
            linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
            linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
        }
      `}</style>
    </DashboardShell>
  );
}

function DropZone({
  onFiles,
  inputRef,
}: {
  onFiles: (files: File[]) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const [active, setActive] = useState(false);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        'cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition-all',
        active
          ? 'border-royal-500 bg-royal-50 dark:bg-royal-950/30 scale-[1.01]'
          : 'border-ink-200 dark:border-ink-700 hover:border-royal-400 hover:bg-royal-50/40',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
      />
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-royal-500 via-royal-600 to-magenta-500 text-white shadow-lift">
          <Camera className="w-8 h-8" />
        </div>
        <div>
          <div className="font-display font-semibold text-lg text-ink-900 dark:text-white">
            Drop a product image here
          </div>
          <div className="text-sm text-ink-500 mt-1">
            or <span className="text-royal-600 font-medium">browse</span> — JPG, PNG, or WebP
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
      {label}
    </span>
  );
}

function AspectIcon({ w, h, active }: { w: number; h: number; active: boolean }) {
  const max = 28;
  const ratio = w / h;
  const boxW = ratio >= 1 ? max : Math.round(max * ratio);
  const boxH = ratio >= 1 ? Math.round(max / ratio) : max;
  return (
    <div className="flex items-center h-7">
      <div
        className={cn(
          'rounded-sm border-2 transition',
          active ? 'border-royal-600 bg-royal-200/60' : 'border-ink-300 dark:border-ink-600',
        )}
        style={{ width: boxW, height: boxH }}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-ink-500 font-medium mb-1">{label}</div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="input-field tabular-nums"
      />
    </label>
  );
}

function RiskMeter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const tier = value >= 0.5 ? 'high' : value >= 0.25 ? 'med' : 'low';
  const colors = {
    high: 'text-red-700 bg-red-100 dark:bg-red-950/40 dark:text-red-300',
    med: 'text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300',
    low: 'text-green-700 bg-green-100 dark:bg-green-950/40 dark:text-green-300',
  } as const;
  const bar = {
    high: 'bg-red-500',
    med: 'bg-amber-500',
    low: 'bg-green-500',
  } as const;
  const labelText = { high: 'High risk', med: 'Review', low: 'Safe' } as const;
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-ink-700 dark:text-ink-300">{label}</div>
        <span className={cn('pill text-[10px]', colors[tier])}>{labelText[tier]}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
        <div className={cn('h-full transition-all', bar[tier])} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-ink-400 tabular-nums mt-1">{pct}% crop risk</div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  swatch?: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        'text-left rounded-xl border-2 p-3 transition flex items-start gap-2.5',
        active
          ? 'border-magenta-500 bg-magenta-50 dark:bg-magenta-950/30 shadow-pink'
          : 'border-ink-200 dark:border-ink-700 hover:border-magenta-300',
      )}
    >
      {swatch && (
        <div className={cn('w-9 h-9 rounded-lg shrink-0 shadow-sm', swatch)} />
      )}
      <div className="min-w-0">
        <div className={cn('text-sm font-semibold truncate', active ? 'text-magenta-700 dark:text-magenta-300' : 'text-ink-900 dark:text-white')}>
          {title}
        </div>
        <div className="text-[11px] text-ink-500 mt-0.5">{desc}</div>
      </div>
    </button>
  );
}
