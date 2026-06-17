'use client';

import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Send, MessageSquare, Mail, CheckCircle2, Clock } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

const conversations = [
  { id: '1', seller: 'Liyana Fashion House', email: 'liyana2015za@gmail.com', lastMessage: 'Sending updated EAN codes and wash care details by EOD.', time: new Date(Date.now() - 1000 * 60 * 25).toISOString(), unread: 1, status: 'awaiting_reply' },
  { id: '2', seller: 'Bombay Silk Stories', email: 'catalog@bombaysilk.com', lastMessage: 'Auto-generated request for missing HSN codes sent.', time: new Date(Date.now() - 1000 * 60 * 60).toISOString(), unread: 0, status: 'sent' },
  { id: '3', seller: 'Kidville Designs', email: 'kidville.designs@gmail.com', lastMessage: 'Please re-share images at higher resolution.', time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), unread: 0, status: 'sent' },
  { id: '4', seller: 'Urban Threads Apparel', email: 'orders@urbanthreads.in', lastMessage: 'All fields confirmed. Ready to upload to portal.', time: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), unread: 0, status: 'resolved' },
];

export default function CommunicationsPage() {
  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="Seller Communications"
          subtitle="Auto-generated emails to sellers for missing data, plus their replies — re-ingested back into the pipeline."
          actions={
            <button className="btn-primary"><Mail className="w-4 h-4" /> Compose</button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 p-0 overflow-hidden">
            <div className="p-4 border-b border-ink-100 dark:border-ink-800">
              <h3 className="font-display font-semibold text-base text-ink-900 dark:text-white">Threads</h3>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {conversations.map((c) => (
                <button key={c.id} className="w-full text-left p-4 hover:bg-ink-50 dark:hover:bg-ink-800/40 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-ink-900 dark:text-white truncate">{c.seller}</span>
                    <span className="text-[11px] text-ink-500 shrink-0">{formatRelative(c.time)}</span>
                  </div>
                  <div className="text-[11px] text-ink-500 truncate mt-0.5">{c.email}</div>
                  <div className="text-xs text-ink-600 dark:text-ink-300 mt-1.5 line-clamp-2">{c.lastMessage}</div>
                  <div className="mt-2 flex items-center justify-between">
                    {c.status === 'awaiting_reply' && <span className="pill bg-magenta-100 text-magenta-700 text-[10px]"><Clock className="w-3 h-3"/> Awaiting reply</span>}
                    {c.status === 'sent' && <span className="pill bg-sky-100 text-sky-700 text-[10px]"><Send className="w-3 h-3"/> Sent</span>}
                    {c.status === 'resolved' && <span className="pill bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-3 h-3"/> Resolved</span>}
                    {c.unread > 0 && <span className="w-2 h-2 rounded-full bg-magenta-500" />}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Thread view */}
          <Card className="lg:col-span-2 !p-0 overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-ink-100 dark:border-ink-800">
              <div className="font-semibold text-ink-900 dark:text-white">Liyana Fashion House</div>
              <div className="text-xs text-ink-500">liyana2015za@gmail.com · em_001</div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
              <div className="flex justify-end">
                <div className="max-w-md rounded-2xl rounded-tr-sm bg-royal-600 text-white p-4 shadow-lift">
                  <div className="text-[11px] opacity-80 mb-1">Auto-sent · 2 hours ago</div>
                  <div className="text-sm">
                    Hi Liyana team,<br /><br />
                    Thanks for the latest catalog (42 SKUs). We've processed the file but a few fields need your input before we can publish:<br /><br />
                    <strong>Missing:</strong> EAN codes (6 SKUs), Wash Care (3 SKUs), Fabric Composition (2 SKUs)<br /><br />
                    Please share these by EOD so we can complete the upload.
                  </div>
                </div>
              </div>

              <div className="flex justify-start">
                <div className="max-w-md rounded-2xl rounded-tl-sm bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-white p-4">
                  <div className="text-[11px] text-ink-500 mb-1">Liyana · 25 min ago</div>
                  <div className="text-sm">Sending updated EAN codes and wash care details by EOD. Sharing in a follow-up Excel attachment.</div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-ink-100 dark:border-ink-800">
              <div className="flex items-end gap-2">
                <textarea
                  className="input-field flex-1 min-h-[44px] max-h-[120px] resize-none"
                  placeholder="Type a reply…"
                  rows={1}
                />
                <button className="btn-primary !py-2.5"><Send className="w-4 h-4" /></button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                <input type="checkbox" defaultChecked className="rounded" />
                Use AI-suggested reply
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
