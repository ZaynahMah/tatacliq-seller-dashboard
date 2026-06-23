'use client';

import { useRef, useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Upload, Image as ImageIcon, Download, X, Scissors } from 'lucide-react';
import { cn } from '@/lib/utils';

// "AI Image Studio" — Beta. Local in-browser resize is real; the full
// AI background-removal flow is roadmap. Everything in this page runs
// client-side via <canvas>; no uploads, no API.

interface QueuedImage {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
}

export default function StudioPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<QueuedImage[]>([]);
  const [scalePct, setScalePct] = useState(100);
  const [busy, setBusy] = useState(false);

  // Tidy up object URLs when the page unmounts
  useEffect(() => () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
  }, [images]);

  function addFiles(files: FileList | File[]) {
    const next: QueuedImage[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\/(jpe?g|png|webp)$/i.test(f.type)) continue;
      const url = URL.createObjectURL(f);
      const id = `${f.name}-${f.size}-${f.lastModified}`;
      next.push({ id, file: f, url, width: 0, height: 0 });
    }
    // Probe dimensions
    for (const q of next) {
      const img = new Image();
      img.onload = () => {
        q.width = img.naturalWidth;
        q.height = img.naturalHeight;
        setImages((prev) => prev.map((p) => (p.id === q.id ? { ...q } : p)));
      };
      img.src = q.url;
    }
    setImages((prev) => [...prev, ...next]);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function processOne(q: QueuedImage): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = Math.max(1, Math.round((img.naturalWidth * scalePct) / 100));
        const h = Math.max(1, Math.round((img.naturalHeight * scalePct) / 100));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas unavailable'));
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
          q.file.type,
          0.92,
        );
      };
      img.onerror = reject;
      img.src = q.url;
    });
  }

  async function processAll() {
    if (!images.length) return;
    setBusy(true);
    try {
      for (const q of images) {
        const blob = await processOne(q);
        const stem = q.file.name.replace(/\.[^.]+$/, '');
        const ext = (q.file.name.match(/\.([^.]+)$/) ?? [, 'jpg'])[1];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${stem}-${scalePct}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the browser a beat between downloads
        await new Promise((r) => setTimeout(r, 80));
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <div className="px-6 lg:px-10 py-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink-900 dark:text-white">
              AI Image Studio
            </h1>
            <p className="text-sm text-ink-500 mt-1 max-w-2xl">
              Prep catalogue images in bulk — resize/re-resolution now, with background
              removal and AI clean-up coming soon. Everything runs in your browser; nothing
              is uploaded.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold tracking-wide px-2 py-1 rounded-md bg-magenta-100 text-magenta-700 dark:bg-magenta-700/20 dark:text-magenta-300">
            BETA
          </span>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Upload column */}
          <Card className="lg:col-span-2 p-5">
            <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">Upload</div>
            <h2 className="font-semibold text-ink-900 dark:text-white mb-1">Catalogue images</h2>
            <p className="text-xs text-ink-500 mb-4">
              Drop product images (JPG/PNG/WebP). Processing happens locally.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              className="w-full border-2 border-dashed border-ink-200 dark:border-ink-700 rounded-xl py-10 px-6 flex flex-col items-center justify-center gap-2 hover:border-magenta-400 hover:bg-magenta-50/40 dark:hover:bg-magenta-950/10 transition"
            >
              <Upload className="w-6 h-6 text-ink-400" />
              <div className="text-sm font-medium text-ink-700 dark:text-ink-200">
                Drop images or click to upload
              </div>
              <div className="text-xs text-ink-500">Bulk upload supported</div>
            </button>

            {images.length > 0 && (
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((q) => (
                  <div key={q.id} className="relative group rounded-lg overflow-hidden border border-ink-100 dark:border-ink-800">
                    <img src={q.url} alt={q.file.name} className="w-full h-32 object-cover" />
                    <button
                      onClick={() => removeImage(q.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="px-2 py-1.5 text-[11px] bg-white/90 dark:bg-ink-900/90 truncate">
                      {q.file.name}
                      {q.width > 0 && (
                        <span className="text-ink-400 ml-1">· {q.width}×{q.height}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Options column */}
          <Card className="p-5 space-y-6">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">Options</div>
              <h2 className="font-semibold text-ink-900 dark:text-white">Processing</h2>
            </div>

            {/* Resolution slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="scale" className="text-xs font-medium text-ink-700 dark:text-ink-200">
                  Resolution — <span className="font-semibold text-magenta-700">{scalePct}%</span>
                </label>
                <span className="text-[10px] text-ink-400">100%</span>
              </div>
              <input
                id="scale"
                type="range"
                min={25}
                max={200}
                step={5}
                value={scalePct}
                onChange={(e) => setScalePct(Number(e.target.value))}
                className="w-full accent-magenta-600"
              />
              <p className="text-[11px] text-ink-500 mt-1.5 leading-snug">
                Scales width &amp; height proportionally. 100% keeps original size.
              </p>
            </div>

            {/* BG removal coming soon */}
            <div className="rounded-lg border border-dashed border-ink-200 dark:border-ink-700 p-3 bg-ink-50/40 dark:bg-ink-900/30">
              <div className="flex items-start gap-2">
                <Scissors className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-ink-700 dark:text-ink-200">
                      Background removal
                    </span>
                    <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      SOON
                    </span>
                  </div>
                  <label className="flex items-center gap-2 mt-1.5 cursor-not-allowed opacity-60">
                    <input type="checkbox" disabled className="w-3.5 h-3.5 accent-magenta-600" />
                    <span className="text-[11px] text-ink-500">Remove background (coming soon)</span>
                  </label>
                  <p className="text-[10.5px] text-ink-500 mt-1.5 leading-snug">
                    In-browser AI background removal will be enabled in a later release.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={processAll}
              disabled={!images.length || busy}
              className={cn(
                'w-full text-sm font-medium py-2.5 rounded-md transition',
                images.length === 0 || busy
                  ? 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500 cursor-not-allowed'
                  : 'bg-magenta-600 text-white hover:bg-magenta-700',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <Download className="w-4 h-4" />
                Resize &amp; download all ({images.length})
              </span>
            </button>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
