'use client';

import { DashboardShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import {
  Mail,
  Filter,
  FileSpreadsheet,
  Sparkles,
  Database,
  Paperclip,
  Inbox,
} from 'lucide-react';

// "Fetch from Email" — planned but not built. This page shows the planned
// pipeline visually so it reads as a roadmap item, not a broken feature.
// Numbers and inbox addresses below are illustrative mockups.

const STATS = [
  { value: '12',  label: 'Inboxes linked' },
  { value: '37',  label: 'Sheets in queue' },
  { value: '128', label: 'Enriched today' },
  { value: '4',   label: 'Needs review' },
];

const INBOUND = [
  { email: 'vendor-supplies@gmail.com', subject: 'Catalogue Upload – AW26 Women Tops', attachments: 2 },
  { email: 'stylemart.seller@gmail.com', subject: 'Catalogue Upload – Kurtas Batch 4', attachments: 1 },
  { email: 'trendz.apparel@gmail.com',   subject: 'Catalogue Upload – Denim Restock',  attachments: 3 },
  { email: 'fab.fashion.in@gmail.com',   subject: 'Catalogue Upload – Dresses June',   attachments: 1 },
];

const STEPS = [
  { icon: Mail,            title: 'Seller emails',        body: '10–15 Gmail inboxes receive seller sheets' },
  { icon: Filter,          title: 'Filter by subject',    body: 'Match the trigger subject line' },
  { icon: FileSpreadsheet, title: 'Extract attachment',   body: 'Pull .xlsx / .csv into a queue' },
  { icon: Sparkles,        title: 'Auto-enrich',          body: 'Run the enrichment engine per sheet' },
  { icon: Database,        title: 'Save to database',     body: 'Store enriched records + audit' },
];

export default function InboxPage() {
  return (
    <DashboardShell>
      <div className="px-6 lg:px-10 py-8 max-w-6xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-ink-900 dark:text-white">
              Fetch from Email
            </h1>
            <p className="text-sm text-ink-500 mt-1 max-w-2xl">
              Automatically pull seller catalogue sheets straight from the inboxes sellers
              email them to — no manual downloads. Matching attachments are queued, enriched,
              and saved to the database.
            </p>
          </div>
          <span className="shrink-0 text-[11px] font-semibold tracking-wide px-2 py-1 rounded-md bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            COMING SOON
          </span>
        </div>

        {/* Stats strip */}
        <Card className="p-5">
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-3">
            Connected inboxes
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-display font-semibold text-ink-900 dark:text-white tabular-nums">
                  {s.value}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Two columns: queue preview + trigger settings */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Inbound queue */}
          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Inbox className="w-4 h-4 text-magenta-600" />
              <h2 className="font-semibold text-ink-900 dark:text-white">Inbound queue</h2>
              <span className="text-[10px] text-ink-400 ml-auto">Mock data — not live yet</span>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {INBOUND.map((m, i) => (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="w-8 h-8 rounded-lg bg-ink-50 dark:bg-ink-800 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-ink-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">
                      {m.email}
                    </div>
                    <div className="text-xs text-ink-500 truncate">{m.subject}</div>
                  </div>
                  <div className="text-xs text-ink-500 flex items-center gap-1 shrink-0 pt-0.5">
                    <Paperclip className="w-3 h-3" />
                    {m.attachments} .xlsx attached
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Trigger subject + connect inbox */}
          <Card className="p-5 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                Trigger subject line
              </div>
              <div className="text-sm text-ink-700 dark:text-ink-200 px-3 py-2 rounded-md bg-ink-50 dark:bg-ink-800/60 font-mono">
                Catalogue Upload
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                Auto-enrich on arrival
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 text-xs font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  On
                </span>
                <span className="text-ink-500 text-xs">using last run settings</span>
              </div>
            </div>

            <button
              disabled
              className="w-full text-sm font-medium py-2.5 rounded-md bg-magenta-100 text-magenta-700 dark:bg-magenta-950/40 dark:text-magenta-300 opacity-60 cursor-not-allowed"
            >
              Connect a Gmail inbox
            </button>
          </Card>
        </div>

        {/* Planned pipeline */}
        <Card className="p-5">
          <div className="mb-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-500">How it will work</div>
            <h2 className="font-semibold text-ink-900 dark:text-white mt-0.5">Planned pipeline</h2>
            <p className="text-xs text-ink-500 mt-1">
              From seller email to enriched record in the database — fully automated.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-3 mt-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-ink-100 dark:border-ink-800 p-3 bg-white/40 dark:bg-ink-900/30"
                >
                  <div className="w-8 h-8 rounded-md bg-magenta-50 dark:bg-magenta-950/30 flex items-center justify-center mb-2.5">
                    <Icon className="w-4 h-4 text-magenta-600 dark:text-magenta-400" />
                  </div>
                  <div className="text-sm font-medium text-ink-800 dark:text-ink-100">{s.title}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{s.body}</div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-ink-500 mt-4 italic">
            Sheets flagged as low-confidence during enrichment are routed to “Needs review”
            instead of being saved automatically.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
