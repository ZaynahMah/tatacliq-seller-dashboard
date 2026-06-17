'use client';

import { useState, useEffect } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Mail, KeyRound, Database, Cloud, Users, Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // On mount, check for ?gmail=connected (from OAuth callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
      setSyncResult('✓ Gmail connected successfully');
    } else if (params.get('gmail') === 'error') {
      setSyncResult('✗ Gmail connection failed — check console');
    }
  }, []);

  async function connectGmail() {
    const { url } = await api.getGmailAuthUrl();
    if (url.startsWith('#')) {
      setSyncResult('No backend configured — set NEXT_PUBLIC_API_URL to enable real Gmail OAuth');
      return;
    }
    window.location.href = url;
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result: any = await api.syncGmail();
      setLastSync(new Date().toLocaleTimeString());
      setSyncResult(
        result.mock
          ? `Mock sync — ${result.synced} emails (start backend for real sync)`
          : `Synced ${result.synced} new email${result.synced === 1 ? '' : 's'}`,
      );
    } catch (err: any) {
      setSyncResult(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
        <PageHeader
          title="Admin Settings"
          subtitle="Manage integrations, API keys, team access, and pipeline configuration."
        />

        <div className="space-y-5">
          {/* Gmail */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Gmail Integration</h3>
                  <span className="pill bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-3 h-3"/> Connected</span>
                </div>
                <p className="text-sm text-ink-500 mt-1">Monitored account: <span className="font-mono text-ink-700 dark:text-ink-300">zaynah15mahmood@gmail.com</span></p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-ink-500">Subject filters</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="pill bg-royal-100 text-royal-700 text-[11px]">New Inventory</span>
                      <span className="pill bg-royal-100 text-royal-700 text-[11px]">Catalog Upload</span>
                      <span className="pill bg-royal-100 text-royal-700 text-[11px]">Product Update</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-ink-500">Polling interval</div>
                    <div className="font-semibold text-ink-900 dark:text-white mt-1">Every 2 minutes</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <button onClick={connectGmail} className="btn-outline whitespace-nowrap">
                  Re-authorize
                </button>
                <button
                  onClick={syncNow}
                  disabled={syncing}
                  className="btn-primary whitespace-nowrap flex items-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className={syncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                  {syncing ? 'Syncing...' : 'Sync now'}
                </button>
                {lastSync && <div className="text-[11px] text-ink-500">Last: {lastSync}</div>}
              </div>
            </div>
            {syncResult && (
              <div className="mt-3 ml-[60px] text-sm rounded-lg bg-royal-50 dark:bg-royal-950/30 text-royal-800 dark:text-royal-200 px-3 py-2">
                {syncResult}
              </div>
            )}
          </Card>

          {/* Gemini */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-royal-100 dark:bg-royal-900/30 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5 text-royal-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Gemini Pro API</h3>
                  <span className="pill bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-3 h-3"/> Active</span>
                </div>
                <p className="text-sm text-ink-500 mt-1">Account: <span className="font-mono text-ink-700 dark:text-ink-300">zaynah15mahmood@gmail.com</span></p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase text-ink-500">Model</div>
                    <div className="font-mono text-ink-900 dark:text-white mt-1 text-xs">gemini-1.5-pro-latest</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-ink-500">API key</div>
                    <div className="font-mono text-ink-900 dark:text-white mt-1 text-xs">••••••••••••a4F2</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-ink-500">Calls today</div>
                    <div className="font-semibold text-ink-900 dark:text-white mt-1 tabular-nums">8,420 / 10,000</div>
                  </div>
                </div>
              </div>
              <button className="btn-outline">Manage</button>
            </div>
          </Card>

          {/* Storage */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Object Storage</h3>
                  <span className="pill bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-3 h-3"/> S3</span>
                </div>
                <p className="text-sm text-ink-500 mt-1">Bucket: <span className="font-mono text-ink-700 dark:text-ink-300">tatacliq-seller-uploads</span> · ap-south-1</p>
              </div>
              <button className="btn-outline">Configure</button>
            </div>
          </Card>

          {/* Database */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-sky-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">PostgreSQL</h3>
                  <span className="pill bg-green-100 text-green-700 text-[10px]"><CheckCircle2 className="w-3 h-3"/> Healthy</span>
                </div>
                <p className="text-sm text-ink-500 mt-1">14,892 products · 384 sellers · 2.4 GB</p>
              </div>
              <button className="btn-outline">Migrations</button>
            </div>
          </Card>

          {/* Team */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-magenta-100 dark:bg-magenta-900/30 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-magenta-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Team Members</h3>
                <p className="text-sm text-ink-500 mt-1">22 operations users · 3 admins</p>
              </div>
              <button className="btn-primary">Invite</button>
            </div>
          </Card>

          {/* Notifications */}
          <Card>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-ink-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Notifications</h3>
                <div className="mt-3 space-y-2.5">
                  {[
                    'Email me when a job fails after 3 retries',
                    'Slack alert when validation queue exceeds 50 items',
                    'Daily digest at 9:00 AM IST',
                  ].map((label, i) => (
                    <label key={i} className="flex items-center gap-3 text-sm">
                      <input type="checkbox" defaultChecked={i !== 1} className="rounded" />
                      <span className="text-ink-700 dark:text-ink-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
