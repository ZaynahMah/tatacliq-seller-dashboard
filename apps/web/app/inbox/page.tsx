'use client';

import { useState } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatusPill, ConfidenceBadge } from '@/components/ui/status-pill';
import { mockEmails, type SellerEmail, type EmailStatus } from '@/lib/mock-data';
import { formatRelative } from '@/lib/utils';
import { Paperclip, RefreshCw, Filter, ChevronRight, X, Sparkles, Send, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const filters: { label: string; value: EmailStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Enriched', value: 'enriched' },
  { label: 'Awaiting Seller', value: 'awaiting_seller' },
  { label: 'Failed', value: 'failed' },
];

export default function InboxPage() {
  const [selected, setSelected] = useState<SellerEmail | null>(null);
  const [filter, setFilter] = useState<EmailStatus | 'all'>('all');

  const filteredEmails = filter === 'all' ? mockEmails : mockEmails.filter(e => e.status === filter);

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Coming Soon banner */}
        <div className="mb-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50 to-orange-50 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/30 p-4 flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-amber-900 dark:text-amber-200">Gmail Inbox Sync — Coming Soon</span>
              <span className="pill bg-amber-200 text-amber-900 text-[10px] font-semibold">PREVIEW</span>
            </div>
            <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              Auto-ingestion from <span className="font-medium">zaynah15mahmood@gmail.com</span> is in development. For now, use{' '}
              <a href="/upload" className="underline font-medium hover:text-amber-900">Upload Catalog</a>{' '}
              for catalog enrichment or{' '}
              <a href="/studio" className="underline font-medium hover:text-amber-900">AI Image Studio</a>{' '}
              for image processing.
            </p>
          </div>
        </div>

        <PageHeader
          title="Seller Inbox"
          subtitle="All inbound emails from sellers, parsed automatically from Gmail."
          actions={
            <>
              <button className="btn-outline opacity-60 cursor-not-allowed" disabled>
                <RefreshCw className="w-4 h-4" /> Sync Now
              </button>
              <button className="btn-primary opacity-60 cursor-not-allowed" disabled>
                <Sparkles className="w-4 h-4" /> Process All
              </button>
            </>
          }
        />

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto scrollbar-thin pb-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'pill px-3 py-1.5 text-xs font-medium transition whitespace-nowrap',
                filter === f.value
                  ? 'bg-royal-600 text-white shadow-lift'
                  : 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-royal-300'
              )}
            >
              {f.label}
              <span className="opacity-60">·</span>
              <span className="tabular-nums">{f.value === 'all' ? mockEmails.length : mockEmails.filter(e => e.status === f.value).length}</span>
            </button>
          ))}
          <button className="ml-auto btn-outline !py-1.5 !px-3 text-xs">
            <Filter className="w-3.5 h-3.5" /> More filters
          </button>
        </div>

        {/* Email table */}
        <Card className="p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-ink-50 dark:bg-ink-800/60 border-b border-ink-100 dark:border-ink-800">
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-5 py-3 font-semibold">Seller</th>
                <th className="px-3 py-3 font-semibold">Subject</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">SKUs</th>
                <th className="px-3 py-3 font-semibold hidden md:table-cell">Attach.</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">AI Score</th>
                <th className="px-3 py-3 font-semibold hidden lg:table-cell">Received</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {filteredEmails.map((email) => (
                <tr
                  key={email.id}
                  onClick={() => setSelected(email)}
                  className="hover:bg-ink-50 dark:hover:bg-ink-800/40 cursor-pointer transition"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blush-100 to-blush-200 dark:from-magenta-900/30 dark:to-magenta-700/20 flex items-center justify-center text-magenta-700 dark:text-magenta-300 font-semibold text-xs shrink-0">
                        {email.sellerName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-ink-900 dark:text-white truncate">{email.sellerName}</div>
                        <div className="text-[11px] text-ink-500 truncate">{email.sellerEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 max-w-[320px]">
                    <div className="text-sm text-ink-700 dark:text-ink-200 truncate font-medium">{email.subject}</div>
                  </td>
                  <td className="px-3 py-4 hidden md:table-cell">
                    <span className="text-sm font-semibold tabular-nums text-ink-700 dark:text-ink-200">{email.productCount}</span>
                  </td>
                  <td className="px-3 py-4 hidden md:table-cell">
                    <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                      <Paperclip className="w-3 h-3" /> {email.attachmentCount}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <StatusPill status={email.status} />
                  </td>
                  <td className="px-3 py-4 hidden lg:table-cell">
                    {email.aiConfidence ? <ConfidenceBadge score={email.aiConfidence} /> : <span className="text-xs text-ink-400">—</span>}
                  </td>
                  <td className="px-3 py-4 hidden lg:table-cell text-xs text-ink-500 whitespace-nowrap">
                    {formatRelative(email.receivedAt)}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <ChevronRight className="w-4 h-4 text-ink-400 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div onClick={() => setSelected(null)} className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm" />
          <div className="relative ml-auto w-full max-w-xl h-full bg-white dark:bg-ink-900 shadow-2xl overflow-y-auto scrollbar-thin animate-fade-up">
            <div className="sticky top-0 bg-white dark:bg-ink-900 border-b border-ink-100 dark:border-ink-800 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Email Details</h3>
              <button onClick={() => setSelected(null)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-ink-100 dark:hover:bg-ink-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blush-100 to-blush-200 dark:from-magenta-900/30 dark:to-magenta-700/20 flex items-center justify-center text-magenta-700 dark:text-magenta-300 font-semibold text-sm">
                  {selected.sellerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className="font-semibold text-ink-900 dark:text-white">{selected.sellerName}</div>
                  <div className="text-xs text-ink-500">{selected.sellerEmail}</div>
                </div>
                <StatusPill status={selected.status} />
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Subject</div>
                <div className="text-sm font-semibold text-ink-900 dark:text-white">{selected.subject}</div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">Body Preview</div>
                <div className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed bg-ink-50 dark:bg-ink-800/50 rounded-xl p-4">{selected.preview}</div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-3">
                  <div className="text-[10px] uppercase text-ink-500">Products</div>
                  <div className="font-display font-bold text-xl text-ink-900 dark:text-white tabular-nums">{selected.productCount}</div>
                </div>
                <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-3">
                  <div className="text-[10px] uppercase text-ink-500">Attachments</div>
                  <div className="font-display font-bold text-xl text-ink-900 dark:text-white tabular-nums">{selected.attachmentCount}</div>
                </div>
                <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-3">
                  <div className="text-[10px] uppercase text-ink-500">Missing</div>
                  <div className="font-display font-bold text-xl text-magenta-600 tabular-nums">{selected.missingFields ?? 0}</div>
                </div>
              </div>

              {selected.aiConfidence && (
                <div className="rounded-xl bg-gradient-to-br from-royal-50 to-blush-50 dark:from-royal-900/20 dark:to-magenta-900/20 p-4 border border-royal-100 dark:border-royal-900/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-royal-700 dark:text-royal-300 font-semibold">AI Confidence</div>
                      <div className="font-display font-bold text-2xl text-ink-900 dark:text-white">{selected.aiConfidence}%</div>
                    </div>
                    <ConfidenceBadge score={selected.aiConfidence} />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button className="btn-primary w-full"><Sparkles className="w-4 h-4" /> Start Enrichment</button>
                <button className="btn-pink w-full"><Send className="w-4 h-4" /> Request Missing Data</button>
                <button className="btn-outline w-full">View Raw Email</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
