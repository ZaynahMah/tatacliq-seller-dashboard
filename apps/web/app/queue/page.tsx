'use client';

import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { mockQueue } from '@/lib/mock-data';
import { RefreshCw, RotateCcw, Pause, Play, Cpu, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

const statusColors: Record<string, { dot: string; text: string; bg: string }> = {
  running: { dot: 'bg-sky-500 animate-pulse-dot', text: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-100 dark:bg-sky-900/30' },
  queued: { dot: 'bg-ink-400', text: 'text-ink-600 dark:text-ink-300', bg: 'bg-ink-100 dark:bg-ink-800' },
  completed: { dot: 'bg-green-500', text: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/30' },
  failed: { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30' },
  retrying: { dot: 'bg-amber-500 animate-pulse-dot', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/30' },
};

const typeLabels: Record<string, string> = {
  enrichment: 'Gemini Enrichment',
  image: 'Image Outpainting',
  validation: 'Validation',
  sheet_generation: 'Master Sheet',
};

export default function QueuePage() {
  const running = mockQueue.filter(j => j.status === 'running').length;
  const queued = mockQueue.filter(j => j.status === 'queued').length;
  const failed = mockQueue.filter(j => j.status === 'failed').length;

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="Processing Queue"
          subtitle="Live status of every enrichment, image, and validation job."
          actions={
            <>
              <button className="btn-outline"><Pause className="w-4 h-4" /> Pause Queue</button>
              <button className="btn-pink"><RotateCcw className="w-4 h-4" /> Retry Failed Jobs</button>
            </>
          }
        />

        {/* Queue summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center"><Cpu className="w-5 h-5 text-sky-600" /></div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase">Running</div>
                <div className="font-display font-bold text-2xl text-ink-900 dark:text-white tabular-nums">{running}</div>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center"><Clock className="w-5 h-5 text-ink-500" /></div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase">Queued</div>
                <div className="font-display font-bold text-2xl text-ink-900 dark:text-white tabular-nums">{queued}</div>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase">Completed (24h)</div>
                <div className="font-display font-bold text-2xl text-ink-900 dark:text-white tabular-nums">428</div>
              </div>
            </div>
          </Card>
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase">Failed</div>
                <div className="font-display font-bold text-2xl text-ink-900 dark:text-white tabular-nums">{failed}</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Workers */}
        <Card className="mb-6">
          <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white mb-4">Active Workers</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {['gemini-worker-1', 'gemini-worker-2', 'sdxl-worker-1', 'sdxl-worker-2', 'validator-1', 'sheet-worker-1'].map((w, i) => (
              <div key={w} className="flex items-center gap-3 p-3 rounded-xl border border-ink-100 dark:border-ink-800">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-royal-100 to-royal-200 dark:from-royal-900/40 dark:to-royal-700/30 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-royal-700 dark:text-royal-300" />
                  </div>
                  <div className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-ink-900', i % 4 === 3 ? 'bg-ink-400' : 'bg-green-500 animate-pulse-dot')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] font-semibold text-ink-900 dark:text-white truncate">{w}</div>
                  <div className="text-[11px] text-ink-500">{i % 4 === 3 ? 'Idle' : `Job ${1000 + i}`}</div>
                </div>
                <div className="text-[10px] text-ink-400 tabular-nums">CPU 64%</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Job list */}
        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Job Queue</h3>
            <button className="btn-outline !py-1.5 !px-3 text-xs"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {mockQueue.map((job) => {
              const status = statusColors[job.status];
              return (
                <div key={job.id} className="p-5 hover:bg-ink-50 dark:hover:bg-ink-800/40 transition">
                  <div className="flex items-center gap-4">
                    <div className={cn('w-2 h-2 rounded-full shrink-0', status.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-ink-900 dark:text-white">{job.productName}</span>
                        <span className={cn('pill text-[10px]', status.bg, status.text)}>{job.status}</span>
                        <span className="pill bg-blush-100 dark:bg-magenta-900/30 text-magenta-700 dark:text-magenta-300 text-[10px]">{typeLabels[job.type]}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ink-500">
                        <span className="font-mono">{job.id}</span>
                        {job.worker && <><span>·</span><span>{job.worker}</span></>}
                        {job.startedAt && <><span>·</span><span>started {formatRelative(job.startedAt)}</span></>}
                        {job.duration && <><span>·</span><span>took {job.duration}</span></>}
                        {job.attempts > 1 && <><span>·</span><span className="text-amber-600">attempt {job.attempts}/3</span></>}
                      </div>
                      {(job.status === 'running' || job.status === 'retrying') && (
                        <div className="mt-2 h-1 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden max-w-md">
                          <div
                            className={cn('h-full rounded-full bg-gradient-to-r', job.status === 'retrying' ? 'from-amber-400 to-amber-600' : 'from-royal-500 to-royal-700')}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {job.status === 'failed' && (
                      <button className="btn-outline !py-1.5 !px-3 text-xs"><RotateCcw className="w-3.5 h-3.5" /> Retry</button>
                    )}
                    {job.status === 'queued' && (
                      <button className="btn-outline !py-1.5 !px-3 text-xs"><Play className="w-3.5 h-3.5" /> Run</button>
                    )}
                    <span className="tabular-nums text-xs text-ink-500 w-10 text-right">{job.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
