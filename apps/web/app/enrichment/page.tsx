'use client';

import { useState } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { ConfidenceBadge } from '@/components/ui/status-pill';
import { mockProducts } from '@/lib/mock-data';
import { Sparkles, Check, X, Edit3, ArrowRight, Wand2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const fieldLabels: Record<string, string> = {
  hsnCode: 'HSN Code',
  sku: 'SKU',
  fabricFamily: 'Fabric Family',
  sleeveType: 'Sleeve Type',
  ageBand: 'Age Band',
  fitType: 'Fit Type',
  neckline: 'Neckline / Collar',
  occasion: 'Occasion',
  pattern: 'Pattern',
  colorFamily: 'Color Family',
  countryOfOrigin: 'Country of Origin',
  ean: 'EAN',
  washCare: 'Wash Care',
  fabricComposition: 'Fabric Composition',
  productType: 'Product Type',
  mrp: 'MRP',
};

export default function EnrichmentPage() {
  const product = mockProducts[0];
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const toggle = (field: string, accept: boolean) => {
    setAccepted(prev => ({ ...prev, [field]: accept }));
  };

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="AI Enrichment Preview"
          subtitle="Review Gemini Pro's suggestions for missing or low-confidence fields before locking the master record."
          actions={
            <>
              <button className="btn-outline"><RefreshCw className="w-4 h-4" /> Re-run AI</button>
              <button className="btn-primary"><Check className="w-4 h-4" /> Accept All & Lock</button>
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product preview */}
          <Card className="lg:col-span-1 p-0 overflow-hidden">
            <div className="relative aspect-[4/5] bg-gradient-to-br from-blush-50 to-sand-50 dark:from-ink-800 dark:to-ink-900">
              <Image
                src={product.image}
                alt={product.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 33vw"
              />
              <div className="absolute top-3 left-3 right-3 flex justify-between">
                <span className="pill bg-white/90 backdrop-blur text-ink-700 shadow-soft text-[11px]">Original 1200×1200</span>
                <ConfidenceBadge score={product.confidence} />
              </div>
            </div>
            <div className="p-5">
              <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">{product.title}</h3>
              <div className="mt-2 text-xs text-ink-500">From Liyana Fashion House · em_001</div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-ink-50 dark:bg-ink-800 p-2.5">
                  <div className="text-ink-500">SKU</div>
                  <div className="font-mono font-semibold text-ink-900 dark:text-white">{product.attributes.sku}</div>
                </div>
                <div className="rounded-lg bg-ink-50 dark:bg-ink-800 p-2.5">
                  <div className="text-ink-500">MRP</div>
                  <div className="font-semibold text-ink-900 dark:text-white">₹{product.attributes.mrp}</div>
                </div>
                <div className="rounded-lg bg-ink-50 dark:bg-ink-800 p-2.5">
                  <div className="text-ink-500">Type</div>
                  <div className="font-semibold text-ink-900 dark:text-white">{product.attributes.productType}</div>
                </div>
                <div className="rounded-lg bg-ink-50 dark:bg-ink-800 p-2.5">
                  <div className="text-ink-500">Color</div>
                  <div className="font-semibold text-ink-900 dark:text-white">{product.attributes.colorFamily}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Suggestions */}
          <div className="lg:col-span-2 space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-royal-600 via-royal-700 to-royal-800 p-5 text-white shadow-lift relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 w-32 h-32 rounded-full bg-magenta-500/30 blur-3xl" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] uppercase tracking-wider opacity-80">Gemini Pro analyzed</div>
                  <div className="font-display font-bold text-lg">12 attribute suggestions ready for review</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] opacity-80">Cross-referenced from</div>
                  <div className="text-xs font-semibold">Myntra · Ajio · Amazon Fashion</div>
                </div>
              </div>
            </div>

            {Object.entries(product.aiSuggestions).map(([field, suggestion]) => {
              const isMissing = product.missing.includes(field);
              const acceptState = accepted[field];

              return (
                <Card key={field} className={cn('!p-4 transition', acceptState === true && 'ring-2 ring-green-400', acceptState === false && 'opacity-60')}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">{fieldLabels[field] || field}</span>
                        {isMissing && <span className="pill bg-magenta-100 text-magenta-700 text-[10px]">Was missing</span>}
                        <ConfidenceBadge score={suggestion.confidence} />
                        <span className="text-[10px] text-ink-400">via {suggestion.source}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-ink-400 line-through">{isMissing ? '—' : 'Generic value'}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-ink-400" />
                        <span className="text-sm font-semibold text-ink-900 dark:text-white">{suggestion.value}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => toggle(field, false)}
                        className={cn('w-9 h-9 rounded-lg flex items-center justify-center transition', acceptState === false ? 'bg-red-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-red-100 hover:text-red-600')}
                        aria-label="Reject"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 transition"
                        aria-label="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggle(field, true)}
                        className={cn('w-9 h-9 rounded-lg flex items-center justify-center transition', acceptState === true ? 'bg-green-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-green-100 hover:text-green-600')}
                        aria-label="Accept"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
