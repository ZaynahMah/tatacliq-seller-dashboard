/**
 * Notify worker (Phase 4) — drafts polite emails to sellers when products
 * have missing fields, then sends via Gmail API on behalf of
 * zaynah15mahmood@gmail.com.
 *
 * Flow:
 *  1. Receive { emailId, missingFields }
 *  2. Call Python enrichment worker's /draft-reply endpoint (Gemini-backed)
 *  3. Persist as Communication row (direction=OUTBOUND, aiDrafted=true)
 *  4. Send via Gmail API
 *  5. Mark Email.status = AWAITING_SELLER
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../db/client';
import { sendGmailReply } from '../services/gmail.service';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

const PYTHON_URL = process.env.PYTHON_WORKER_URL ?? 'http://localhost:8000';

new Worker(
  'notify',
  async (job) => {
    const { emailId, missingFields } = job.data as {
      emailId: string;
      missingFields: string[];
    };

    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { seller: true },
    });
    if (!email) return { skipped: true };

    // Ask Gemini (via Python worker) to draft a polite email body
    const draftBody = await draftEmail({
      sellerName: email.seller.name,
      brandName: email.seller.brandName ?? email.seller.name,
      originalSubject: email.subject,
      missingFields,
    });

    const subject = `Re: ${email.subject} — A few details needed`;

    // Persist as a Communication row
    await prisma.communication.create({
      data: {
        emailId: email.id,
        direction: 'OUTBOUND',
        subject,
        body: draftBody,
        aiDrafted: true,
        sentAt: new Date(),
      },
    });

    // Send via Gmail API (replies on the same thread)
    if (email.threadId) {
      await sendGmailReply({
        to: email.fromAddress,
        subject,
        body: draftBody,
        threadId: email.threadId,
      }).catch((err) => {
        console.error('[notify] gmail send failed:', err.message);
      });
    }

    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'AWAITING_SELLER' },
    });

    return { ok: true };
  },
  { connection },
);

async function draftEmail(args: {
  sellerName: string;
  brandName: string;
  originalSubject: string;
  missingFields: string[];
}): Promise<string> {
  try {
    const r = await fetch(`${PYTHON_URL}/draft-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = (await r.json()) as { body: string };
    return data.body;
  } catch {
    // Fallback template if Gemini is unreachable
    const fields = args.missingFields.map((f) => `- ${f.replace(/_/g, ' ')}`).join('\n');
    return `Hi ${args.sellerName},

Thanks for sending the catalog for ${args.brandName}. Before we can submit your products, we need a few details:

${fields}

Could you reply to this email with the missing information? We'll process everything within 24 hours of your response.

Best,
Catalog Operations Team`;
  }
}

console.log('[notify-worker] ready');
