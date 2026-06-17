'use client';

import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, Card } from '@/components/ui/card';
import { StatusPill, ConfidenceBadge } from '@/components/ui/status-pill';
import { mockEmails, mockProcessingStats, analyticsData } from '@/lib/mock-data';
import { formatRelative } from '@/lib/utils';
import {
  Inbox,
  Sparkles,
  ListChecks,
  AlertCircle,
  ArrowUpRight,
  ArrowRight,
  Play,
  Download,
  Paperclip,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

export default function DashboardPage() {
  const recentEmails = mockEmails.slice(0, 5);

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="Good morning, Zaynah 👋"
          subtitle="Here's what's happening across your seller pipeline today."
          actions={
            <>
              <button className="btn-outline">
                <Download className="w-4 h-4" /> Export Report
              </button>
              <a href="/upload" className="btn-primary">
                <Play className="w-4 h-4" /> Upload & Enrich
              </a>
            </>
          }
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Emails Today"
            value={mockProcessingStats.totalToday}
            delta="12%"
            icon={<Inbox className="w-5 h-5" />}
            accent="royal"
          />
          <StatCard
            label="Enriched"
            value={mockProcessingStats.enriched}
            delta="8%"
            icon={<Sparkles className="w-5 h-5" />}
            accent="pink"
          />
          <StatCard
            label="In Queue"
            value={mockProcessingStats.inQueue}
            icon={<ListChecks className="w-5 h-5" />}
            accent="sky"
          />
          <StatCard
            label="Avg Confidence"
            value={`${mockProcessingStats.avgConfidence}%`}
            delta="2.1%"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 2l2.4 7.2H22l-6 4.4 2.4 7.2-6-4.4-6 4.4 2.4-7.2-6-4.4h7.6z"/></svg>}
            accent="green"
          />
        </div>

        {/* Two-pipeline hero cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <a
            href="/upload"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-royal-600 via-royal-700 to-royal-900 p-6 text-white shadow-lift hover:shadow-xl transition"
          >
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl group-hover:bg-white/20 transition" />
            <div className="relative">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur mb-3">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="font-display font-bold text-xl">Upload Catalog</div>
              <div className="text-sm opacity-85 mt-1">
                Drop seller Excel/CSV → Gemini fills missing fields → download enriched master sheet.
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                Start enrichment <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </div>
            </div>
          </a>

          <a
            href="/studio"
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-magenta-500 via-magenta-600 to-magenta-700 p-6 text-white shadow-lift hover:shadow-xl transition"
          >
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl group-hover:bg-white/20 transition" />
            <div className="relative">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur mb-3">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="font-display font-bold text-xl">AI Image Studio</div>
              <div className="text-sm opacity-85 mt-1">
                Resize product photos to any aspect ratio. Preserves heads, hands, feet — no white padding.
              </div>
              <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                Enhance an image <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </div>
            </div>
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent emails */}
          <div className="lg:col-span-2">
            <Card className="p-0">
              <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Recent Seller Uploads</h3>
                  <p className="text-xs text-ink-500 mt-0.5">Pulled live from connected Gmail account</p>
                </div>
                <Link href="/inbox" className="text-xs font-medium text-royal-600 hover:text-royal-800 flex items-center gap-1">
                  View all <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {recentEmails.map((email) => (
                  <Link
                    key={email.id}
                    href={`/inbox?id=${email.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blush-100 to-blush-200 dark:from-magenta-900/30 dark:to-magenta-700/20 flex items-center justify-center text-magenta-700 dark:text-magenta-300 font-semibold text-sm shrink-0">
                      {email.sellerName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink-900 dark:text-white truncate">{email.sellerName}</span>
                        <span className="text-[11px] text-ink-400">·</span>
                        <span className="text-[11px] text-ink-500 truncate">{email.sellerEmail}</span>
                      </div>
                      <div className="text-[13px] text-ink-600 dark:text-ink-300 truncate mt-0.5">{email.subject}</div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-ink-500">
                      <Paperclip className="w-3 h-3" /> {email.attachmentCount}
                    </div>
                    <StatusPill status={email.status} />
                    <div className="hidden lg:block text-[11px] text-ink-400 w-16 text-right">
                      {formatRelative(email.receivedAt)}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            {/* AI Metrics */}
            <Card>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-base text-ink-900 dark:text-white">AI Performance</h3>
                <span className="pill bg-royal-100 text-royal-700 dark:bg-royal-900/30 dark:text-royal-200">Gemini Pro</span>
              </div>
              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-500">Avg processing time</span>
                    <span className="font-semibold text-ink-900 dark:text-white tabular-nums">{mockProcessingStats.avgProcessingTime}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div className="h-full w-[68%] bg-gradient-to-r from-royal-500 to-royal-700 rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-500">Avg confidence</span>
                    <span className="font-semibold text-ink-900 dark:text-white tabular-nums">{mockProcessingStats.avgConfidence}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div className="h-full w-[89%] bg-gradient-to-r from-magenta-400 to-magenta-600 rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-500">Image success rate</span>
                    <span className="font-semibold text-ink-900 dark:text-white tabular-nums">94.2%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div className="h-full w-[94%] bg-gradient-to-r from-sky-400 to-royal-500 rounded-full" />
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-ink-500 uppercase tracking-wider">Cost saved this month</div>
                  <div className="font-display font-bold text-2xl text-ink-900 dark:text-white mt-0.5">
                    ₹{mockProcessingStats.costSavedThisMonth}L
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-magenta-100 to-magenta-200 dark:from-magenta-900/40 dark:to-magenta-700/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-magenta-600" />
                </div>
              </div>
            </Card>

            {/* Pending validations */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-base text-ink-900 dark:text-white">Needs Attention</h3>
                <Link href="/validation" className="text-xs font-medium text-royal-600 hover:text-royal-800">View all</Link>
              </div>
              <div className="space-y-3">
                {[
                  { type: 'Duplicate SKU', count: 2, severity: 'error' },
                  { type: 'Invalid EAN', count: 3, severity: 'error' },
                  { type: 'Low AI confidence', count: 5, severity: 'warning' },
                  { type: 'Awaiting seller reply', count: 1, severity: 'info' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-ink-50 dark:bg-ink-800/50">
                    <div className="flex items-center gap-3">
                      <div className={
                        item.severity === 'error' ? 'w-2 h-2 rounded-full bg-red-500' :
                        item.severity === 'warning' ? 'w-2 h-2 rounded-full bg-amber-500' :
                        'w-2 h-2 rounded-full bg-sky-500'
                      } />
                      <span className="text-sm text-ink-700 dark:text-ink-200">{item.type}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">{item.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Weekly volume chart */}
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Weekly Processing Volume</h3>
              <p className="text-xs text-ink-500 mt-0.5">Enriched vs failed jobs across the past 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-royal-500"/> Enriched</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-magenta-300"/> Failed</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analyticsData.weeklyVolume} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(229 231 235)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px -4px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="enriched" fill="#3d5dff" radius={[6, 6, 0, 0]} />
                <Bar dataKey="failed" fill="#ff97c8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
