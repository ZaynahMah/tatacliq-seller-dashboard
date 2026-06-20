'use client';

import { useState } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { FileSpreadsheet, Download, Send, RefreshCw, Eye, CheckCircle2 } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { api } from '@/lib/api';

interface Sheet {
  id: string;
  name: string;
  seller: string;
  products: number;
  generatedAt: string;
  status: 'ready' | 'submitted' | 'pending_validation';
  size: string;
  portalRef?: string;
}

const initialSheets: Sheet[] = [
  { id: 's_001', name: 'Urban Threads — Men Casual Shirts Q4', seller: 'Urban Threads Apparel', products: 28, generatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), status: 'ready', size: '142 KB' },
  { id: 's_002', name: 'Northstar — Premium Denim AW25', seller: 'Northstar Denim Co.', products: 56, generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), status: 'submitted', size: '284 KB', portalRef: 'TC-A82F31' },
  { id: 's_003', name: 'Heritage Weaves — Handloom Cottons', seller: 'Heritage Weaves', products: 19, generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), status: 'ready', size: '98 KB' },
  { id: 's_004', name: 'Liyana — Summer Kurta Collection', seller: 'Liyana Fashion House', products: 42, generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), status: 'pending_validation', size: '—' },
];

const statusBadge = {
  ready: 'bg-green-100 text-green-700',
  submitted: 'bg-royal-100 text-royal-700',
  pending_validation: 'bg-amber-100 text-amber-700',
};

const statusLabel = {
  ready: 'Ready to Submit',
  submitted: 'Submitted to Portal',
  pending_validation: 'Pending Validation',
};

export default function SheetsPage() {
  const [sheets, setSheets] = useState<Sheet[]>(initialSheets);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function submitSheet(sheet: Sheet) {
    setBusyId(sheet.id);
    try {
      const result: any = await api.submitToPortal(sheet.id);
      setSheets((prev) =>
        prev.map((s) =>
          s.id === sheet.id ? { ...s, status: 'submitted', portalRef: result.portalRef } : s,
        ),
      );
      setToast(`✓ Submitted "${sheet.name}" — portal reference ${result.portalRef}`);
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      setToast(`✗ Submit failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  function downloadSheet(sheet: Sheet) {
    // Phase 1: simulate. Phase 2: returns a presigned S3 URL.
    setToast(`Downloading ${sheet.name}.xlsx... (mock)`);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="Master Sheets"
          subtitle="Final, portal-ready XLSX outputs generated from enriched seller data."
          actions={
            <>
              <button className="btn-outline"><RefreshCw className="w-4 h-4" /> Regenerate All</button>
              <button className="btn-primary"><Download className="w-4 h-4" /> Bulk Download</button>
            </>
          }
        />

        {toast && (
          <div className="mb-4 rounded-xl bg-royal-600 text-white px-4 py-3 text-sm shadow-lift">
            {toast}
          </div>
        )}

        <Card>
          <div className="space-y-2">
            {sheets.map((sheet) => (
              <div key={sheet.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-900/50 transition">
                <div className="w-10 h-10 rounded-xl bg-royal-100 dark:bg-royal-900/30 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-royal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-ink-900 dark:text-white truncate">{sheet.name}</div>
                    <span className={`pill text-[10px] ${statusBadge[sheet.status]}`}>{statusLabel[sheet.status]}</span>
                    {sheet.portalRef && (
                      <span className="text-[10px] font-mono text-ink-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        {sheet.portalRef}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
                    <span>{sheet.seller}</span>
                    <span>·</span>
                    <span className="tabular-nums">{sheet.products} SKUs</span>
                    <span>·</span>
                    <span>{sheet.size}</span>
                    <span>·</span>
                    <span>{formatRelative(sheet.generatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button className="btn-outline !py-1.5 !px-3 text-xs"><Eye className="w-3.5 h-3.5" /> Preview</button>
                  {sheet.status === 'ready' && (
                    <>
                      <button onClick={() => downloadSheet(sheet)} className="btn-outline !py-1.5 !px-3 text-xs">
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                      <button
                        onClick={() => submitSheet(sheet)}
                        disabled={busyId === sheet.id}
                        className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-60"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {busyId === sheet.id ? 'Submitting...' : 'Submit to Portal'}
                      </button>
                    </>
                  )}
                  {sheet.status === 'submitted' && (
                    <button onClick={() => downloadSheet(sheet)} className="btn-outline !py-1.5 !px-3 text-xs">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
