/**
 * API client. Calls the Node backend if NEXT_PUBLIC_API_URL is set
 * (and the backend is running). Falls back to mock data otherwise so the
 * frontend works standalone for demos.
 */
import { mockEmails, mockProducts, mockValidationIssues } from './mock-data';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const USE_BACKEND = Boolean(API_URL);

async function tryFetch<T>(path: string, init?: RequestInit, fallback?: T): Promise<T> {
  if (!USE_BACKEND) return fallback as T;
  try {
    const r = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as T;
  } catch {
    if (fallback === undefined) throw new Error('Backend unavailable');
    return fallback;
  }
}

// ---------- Emails ----------
export const api = {
  listEmails: () => tryFetch('/emails', undefined, { emails: mockEmails, total: mockEmails.length }),
  getEmail: (id: string) =>
    tryFetch(`/emails/${id}`, undefined, mockEmails.find((e) => e.id === id) ?? null),
  requestMissing: (id: string) =>
    tryFetch(`/emails/${id}/request-missing`, { method: 'POST' }, { ok: true, mock: true }),

  // ---------- Products / Enrichment ----------
  listProducts: () => tryFetch('/products', undefined, { products: mockProducts }),
  enrichProduct: (id: string) =>
    tryFetch(
      `/products/${id}/enrich`,
      { method: 'POST' },
      { ok: true, jobId: `mock_${Math.random().toString(36).slice(2, 8)}`, mock: true },
    ),
  acceptSuggestion: (productId: string, suggestionId: string) =>
    tryFetch(
      `/products/${productId}/suggestions/${suggestionId}/accept`,
      { method: 'POST' },
      { ok: true, mock: true },
    ),

  // ---------- Gmail ----------
  getGmailAuthUrl: () =>
    tryFetch<{ url: string }>('/gmail/auth-url', undefined, {
      url: '#mock-gmail-oauth-url',
    }),
  syncGmail: () =>
    tryFetch(
      '/gmail/sync',
      { method: 'POST' },
      { synced: 3, newEmailIds: ['em_mock_1', 'em_mock_2', 'em_mock_3'], mock: true },
    ),

  // ---------- Jobs ----------
  listJobs: () => tryFetch('/jobs', undefined, { jobs: [], summary: [] }),

  // ---------- Sheets ----------
  generateSheet: (sellerId: string) =>
    tryFetch(
      '/sheets/generate',
      { method: 'POST', body: JSON.stringify({ sellerId }) },
      { ok: true, sheetId: 'sheet_mock', downloadUrl: '#', mock: true },
    ),
  submitToPortal: (sheetId: string) =>
    tryFetch(
      `/sheets/${sheetId}/submit`,
      { method: 'POST' },
      { ok: true, portalRef: `TC-${Date.now()}`, mock: true },
    ),
};

// Convenience: file upload (multipart, no JSON header)
export async function uploadFile(file: File): Promise<{ ok: boolean; filename: string; storageKey: string }> {
  const form = new FormData();
  form.append('file', file);

  // Always goes through Next.js API route (which proxies to backend if available)
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  if (!r.ok) throw new Error('Upload failed');
  return r.json();
}
