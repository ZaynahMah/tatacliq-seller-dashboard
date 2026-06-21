'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import {
  DollarSign,
  TrendingUp,
  Sparkles,
  ImageIcon,
  FileSpreadsheet,
  Zap,
  Calculator,
  Coins,
  Activity,
} from 'lucide-react';

interface UsageSummary {
  totalEvents: number;
  totalCostUsd: number;
  totalTokens: number;
  imageEvents: number;
  catalogEvents: number;
  totalProductsEnriched: number;
  totalImagesEnhanced: number;
  geminiEvents: number;
  fallbackEvents: number;
  geminiPercentage: number;
  avgCostPerImageUsd: number;
  avgCostPerProductUsd: number;
  avgCostPerSheetUsd: number;
  avgTokensPerImage: number;
  avgTokensPerProduct: number;
  byMode: Record<string, { count: number; costUsd: number }>;
  monthlyProjectionUsd: number;
  monthlyProjectionInr: number;
}

const USD_TO_INR = 83.5;

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  // Calculator inputs
  const [calcProducts, setCalcProducts] = useState(5000);
  const [calcImages, setCalcImages] = useState(15000);
  const [calcGeminiPct, setCalcGeminiPct] = useState(80);

  useEffect(() => {
    fetch('/api/usage')
      .then((r) => r.json())
      .then((data) => setSummary(data.summary))
      .catch(() => {});
    const t = setInterval(() => {
      fetch('/api/usage')
        .then((r) => r.json())
        .then((data) => setSummary(data.summary))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Calculator math — uses live averages if available, else canonical Gemini pricing
  const perImage = summary?.avgCostPerImageUsd ?? 0.039;
  const perProduct = summary?.avgCostPerProductUsd ?? 0.0008;
  const geminiFraction = calcGeminiPct / 100;
  const calcImageCostUsd = calcImages * perImage * geminiFraction;
  const calcCatalogCostUsd = calcProducts * perProduct * geminiFraction;
  const calcTotalUsd = calcImageCostUsd + calcCatalogCostUsd;
  const calcTotalInr = calcTotalUsd * USD_TO_INR;
  const costPerSheet50 = 50 * perProduct * geminiFraction; // 50-product sheet

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="Usage & Cost Analytics"
          subtitle="Live token usage, per-product cost, and monthly projections to plan dashboard scaling."
        />

        {/* Live stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile
            label="Total cost (session)"
            value={`$${(summary?.totalCostUsd ?? 0).toFixed(4)}`}
            sub={`₹${((summary?.totalCostUsd ?? 0) * USD_TO_INR).toFixed(2)}`}
            icon={<DollarSign className="w-4 h-4" />}
            tint="royal"
          />
          <StatTile
            label="Tokens used"
            value={fmtNum(summary?.totalTokens ?? 0)}
            sub={`${summary?.totalEvents ?? 0} API calls`}
            icon={<Activity className="w-4 h-4" />}
            tint="sky"
          />
          <StatTile
            label="Gemini vs Fallback"
            value={`${Math.round(summary?.geminiPercentage ?? 0)}%`}
            sub={`${summary?.geminiEvents ?? 0} Gemini · ${summary?.fallbackEvents ?? 0} fallback`}
            icon={<Sparkles className="w-4 h-4" />}
            tint="magenta"
          />
          <StatTile
            label="30-day projection"
            value={`$${(summary?.monthlyProjectionUsd ?? 0).toFixed(2)}`}
            sub={`₹${(summary?.monthlyProjectionInr ?? 0).toFixed(0)}/month`}
            icon={<TrendingUp className="w-4 h-4" />}
            tint="green"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          {/* Per-unit costs */}
          <Card className="p-5 lg:col-span-2">
            <h3 className="font-display font-semibold text-ink-900 dark:text-white mb-4">
              Per-unit economics
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <UnitCost
                icon={<ImageIcon className="w-4 h-4 text-magenta-600" />}
                label="Per enhanced image"
                priceUsd={perImage}
                tokens={summary?.avgTokensPerImage ?? 2580}
              />
              <UnitCost
                icon={<FileSpreadsheet className="w-4 h-4 text-royal-600" />}
                label="Per product enriched"
                priceUsd={perProduct}
                tokens={summary?.avgTokensPerProduct ?? 800}
              />
              <UnitCost
                icon={<Zap className="w-4 h-4 text-amber-600" />}
                label="Per 50-product sheet"
                priceUsd={perProduct * 50}
                tokens={(summary?.avgTokensPerProduct ?? 800) * 50}
              />
            </div>
            <div className="mt-5 pt-4 border-t border-ink-100 dark:border-ink-800 text-[11px] text-ink-500 leading-relaxed">
              Pricing baseline:&nbsp;
              <b className="text-ink-700 dark:text-ink-300">Gemini 2.5 Flash Image</b> — $30/1M output
              tokens, $0.039 per output image, ~1290 tokens per ≤1024 px image.&nbsp;
              <b className="text-ink-700 dark:text-ink-300">Gemini 2.5 Flash text</b> — $0.30/1M in,
              $2.50/1M out. Source: Google AI for Developers, May 2026.
            </div>
          </Card>

          {/* Engine mix donut */}
          <Card className="p-5">
            <h3 className="font-display font-semibold text-ink-900 dark:text-white mb-4">
              Engine mix
            </h3>
            <EngineMix
              gemini={summary?.geminiEvents ?? 0}
              fallback={summary?.fallbackEvents ?? 0}
            />
            <div className="mt-4 space-y-2 text-sm">
              <Legend dot="bg-royal-600" label="Gemini Pro" value={summary?.geminiEvents ?? 0} />
              <Legend dot="bg-ink-300 dark:bg-ink-600" label="Fallback (free)" value={summary?.fallbackEvents ?? 0} />
            </div>
          </Card>
        </div>

        {/* Calculator */}
        <Card className="p-6 mb-6 border-royal-200 ring-1 ring-royal-200/50">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-5 h-5 text-royal-600" />
            <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">
              Scale calculator
            </h3>
          </div>
          <p className="text-sm text-ink-500 mb-5">
            Estimate monthly cost based on your operations volume. Slide the Gemini % to plan a
            hybrid mix where high-confidence items use the fallback.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <SliderInput
              label="Products enriched / month"
              value={calcProducts}
              onChange={setCalcProducts}
              min={100}
              max={100000}
              step={100}
              fmt={fmtNum}
            />
            <SliderInput
              label="Images enhanced / month"
              value={calcImages}
              onChange={setCalcImages}
              min={100}
              max={500000}
              step={100}
              fmt={fmtNum}
            />
            <SliderInput
              label="% routed to Gemini"
              value={calcGeminiPct}
              onChange={setCalcGeminiPct}
              min={0}
              max={100}
              step={5}
              fmt={(v) => `${v}%`}
              hint={`${100 - calcGeminiPct}% via fallback (free)`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <ResultTile
              label="Catalog cost"
              usd={calcCatalogCostUsd}
              detail={`${fmtNum(calcProducts)} products`}
            />
            <ResultTile
              label="Image cost"
              usd={calcImageCostUsd}
              detail={`${fmtNum(calcImages)} images`}
            />
            <ResultTile
              label="Monthly total"
              usd={calcTotalUsd}
              detail={`${fmtNum(calcImages + calcProducts)} ops`}
              highlight
            />
            <ResultTile
              label="Per 50-SKU sheet"
              usd={costPerSheet50}
              detail="Avg seller upload"
            />
          </div>

          <div className="mt-5 rounded-xl bg-royal-50 dark:bg-royal-950/30 p-4 text-sm text-ink-700 dark:text-ink-200 leading-relaxed">
            <b className="text-royal-700 dark:text-royal-300">Scaling note:</b>{' '}
            At <b>{fmtNum(calcProducts + calcImages)} ops/month</b> with{' '}
            <b>{calcGeminiPct}%</b> Gemini routing, you'll spend roughly{' '}
            <b>${calcTotalUsd.toFixed(2)} / ₹{calcTotalInr.toFixed(0)} per month</b>. To stay free,
            keep Gemini % at 0 and use the deterministic fallback — quality is good for ~80% of
            standard fashion catalog items.
          </div>
        </Card>

        {/* By-mode breakdown */}
        {summary && Object.keys(summary.byMode).length > 0 && (
          <Card className="p-5">
            <h3 className="font-display font-semibold text-ink-900 dark:text-white mb-4">
              Image enhancement modes
            </h3>
            <div className="space-y-2">
              {Object.entries(summary.byMode).map(([mode, stats]) => (
                <div key={mode} className="flex items-center gap-3 p-3 rounded-lg bg-ink-50 dark:bg-ink-900/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-magenta-100 text-magenta-700">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-900 dark:text-white">
                      {mode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    <div className="text-xs text-ink-500">{stats.count} images</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono tabular-nums text-ink-900 dark:text-white">
                      ${stats.costUsd.toFixed(4)}
                    </div>
                    <div className="text-[11px] text-ink-400">₹{(stats.costUsd * USD_TO_INR).toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

// =====================
// Components
// =====================

function StatTile({
  label,
  value,
  sub,
  icon,
  tint,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tint: 'royal' | 'magenta' | 'green' | 'sky';
}) {
  const tints = {
    royal: 'bg-royal-100 text-royal-700',
    magenta: 'bg-magenta-100 text-magenta-700',
    green: 'bg-green-100 text-green-700',
    sky: 'bg-sky-100 text-sky-700',
  } as const;
  return (
    <div className="card !p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-ink-500 font-medium">{label}</div>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tints[tint]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-display font-bold text-ink-900 dark:text-white tabular-nums">
        {value}
      </div>
      <div className="text-xs text-ink-500 mt-0.5 tabular-nums">{sub}</div>
    </div>
  );
}

function UnitCost({
  icon,
  label,
  priceUsd,
  tokens,
}: {
  icon: React.ReactNode;
  label: string;
  priceUsd: number;
  tokens: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <div className="text-[11px] uppercase tracking-wide text-ink-500 font-medium">{label}</div>
      </div>
      <div className="text-2xl font-display font-bold text-ink-900 dark:text-white tabular-nums">
        ${priceUsd.toFixed(4)}
      </div>
      <div className="text-xs text-ink-500 tabular-nums">
        ₹{(priceUsd * USD_TO_INR).toFixed(3)} · ~{fmtNum(Math.round(tokens))} tokens
      </div>
    </div>
  );
}

function EngineMix({ gemini, fallback }: { gemini: number; fallback: number }) {
  const total = gemini + fallback;
  const pct = total > 0 ? (gemini / total) * 100 : 0;
  const circumference = 2 * Math.PI * 42;
  const dash = (pct / 100) * circumference;
  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="10" className="text-ink-100 dark:text-ink-800" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-royal-600 transition-all"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-display font-bold text-ink-900 dark:text-white tabular-nums">
          {Math.round(pct)}%
        </div>
        <div className="text-[10px] uppercase tracking-wider text-ink-500">Gemini</div>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      <span className="text-ink-700 dark:text-ink-300 flex-1">{label}</span>
      <span className="font-mono tabular-nums text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  fmt,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs uppercase tracking-wide text-ink-500 font-medium">{label}</label>
        <span className="font-display font-bold text-lg text-royal-700 dark:text-royal-300 tabular-nums">
          {fmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-royal-600"
      />
      {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}

function ResultTile({
  label,
  usd,
  detail,
  highlight,
}: {
  label: string;
  usd: number;
  detail: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight
          ? 'bg-gradient-to-br from-royal-600 to-royal-800 text-white shadow-soft'
          : 'bg-ink-50 dark:bg-ink-900/50'
      }`}
    >
      <div className={`text-[11px] uppercase tracking-wide font-medium ${highlight ? 'opacity-85' : 'text-ink-500'}`}>
        {label}
      </div>
      <div className={`text-2xl font-display font-bold tabular-nums mt-1 ${highlight ? '' : 'text-ink-900 dark:text-white'}`}>
        ${usd.toFixed(2)}
      </div>
      <div className={`text-xs tabular-nums mt-0.5 ${highlight ? 'opacity-85' : 'text-ink-500'}`}>
        ₹{(usd * USD_TO_INR).toFixed(0)} · {detail}
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}
