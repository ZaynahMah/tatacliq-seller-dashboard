import { google, gmail_v1 } from 'googleapis';
import { prisma } from '../db/client';
import { uploadToS3 } from './s3.service';
import { enqueueParse } from './queue.service';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  );
}

export function getAuthUrl() {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  // TODO: persist tokens against the operations user (encrypted at rest).
  return tokens;
}

function getGmailClient(): gmail_v1.Gmail {
  const client = oauthClient();
  // In production, hydrate from stored refresh token:
  // client.setCredentials({ refresh_token: storedToken });
  return google.gmail({ version: 'v1', auth: client });
}

/**
 * Sync inbox: pull messages matching seller filters, persist Email +
 * Attachment rows, push attachments to S3, then enqueue parse jobs.
 *
 * Filter: from the seller test address OR subject contains catalog keywords.
 */
export async function syncInbox() {
  const gmail = getGmailClient();
  const sellerEmail = process.env.SELLER_TEST_EMAIL ?? 'liyana2015za@gmail.com';
  const q = `(from:${sellerEmail}) OR (subject:"Catalog Upload") OR (subject:"New Inventory")`;

  const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 });
  const messages = list.data.messages ?? [];
  const newEmailIds: string[] = [];

  for (const m of messages) {
    if (!m.id) continue;

    const existing = await prisma.email.findUnique({ where: { gmailMessageId: m.id } });
    if (existing) continue;

    const detail = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
    const headers = detail.data.payload?.headers ?? [];
    const fromHeader = headers.find((h) => h.name === 'From')?.value ?? '';
    const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
    const dateHeader = headers.find((h) => h.name === 'Date')?.value;
    const fromMatch = fromHeader.match(/<(.+?)>/);
    const fromAddress = fromMatch ? fromMatch[1] : fromHeader;

    const seller = await prisma.seller.upsert({
      where: { email: fromAddress },
      create: { email: fromAddress, name: fromAddress.split('@')[0] },
      update: {},
    });

    const email = await prisma.email.create({
      data: {
        gmailMessageId: m.id,
        threadId: detail.data.threadId ?? null,
        sellerId: seller.id,
        fromAddress,
        subject,
        receivedAt: dateHeader ? new Date(dateHeader) : new Date(),
        status: 'PENDING',
      },
    });

    // Walk parts, upload attachments
    const parts = detail.data.payload?.parts ?? [];
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        const att = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: m.id,
          id: part.body.attachmentId,
        });
        const buf = Buffer.from(att.data.data ?? '', 'base64');
        const storageKey = `attachments/${email.id}/${part.filename}`;
        await uploadToS3(storageKey, buf, part.mimeType ?? 'application/octet-stream');

        await prisma.attachment.create({
          data: {
            emailId: email.id,
            filename: part.filename,
            mimeType: part.mimeType ?? 'application/octet-stream',
            size: buf.length,
            storageKey,
            type: detectAttachmentType(part.filename, part.mimeType ?? ''),
          },
        });
      }
    }

    await enqueueParse(email.id);
    newEmailIds.push(email.id);
  }

  return { synced: newEmailIds.length, newEmailIds };
}

function detectAttachmentType(filename: string, mime: string) {
  const f = filename.toLowerCase();
  if (f.endsWith('.xlsx') || f.endsWith('.xls')) return 'EXCEL';
  if (f.endsWith('.csv')) return 'CSV';
  if (f.endsWith('.zip')) return 'ZIP';
  if (f.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('image/')) return 'IMAGE';
  return 'OTHER';
}

/**
 * Send an outbound reply on an existing thread (Phase 4).
 */
export async function sendGmailReply(args: {
  to: string;
  subject: string;
  body: string;
  threadId: string;
}) {
  const gmail = getGmailClient();
  const monitored = process.env.GMAIL_MONITORED_ACCOUNT ?? 'me';

  const message = [
    `From: ${monitored}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    args.body,
  ].join('\r\n');

  const encoded = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: args.threadId },
  });
}
