/**
 * Parse worker — reads Excel/CSV attachments from S3, normalizes the columns
 * sellers actually send (titles vary wildly), and inserts Product rows.
 *
 * Run as: tsx src/workers/parse.worker.ts
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as XLSX from 'xlsx';
import { prisma } from '../db/client';
import { presignDownload } from '../services/s3.service';
import { enqueueEnrichment } from '../services/queue.service';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

/**
 * Column aliases — sellers send headers like "Product Name", "Item Title",
 * "MRP (INR)", "हिन्दी" etc. We normalize.
 */
const COLUMN_ALIASES: Record<string, string> = {
  'product name': 'title',
  'item title': 'title',
  'product title': 'title',
  'sku code': 'sku',
  'seller sku': 'sku',
  'article id': 'sku',
  'ean': 'ean',
  'barcode': 'ean',
  'mrp': 'mrp',
  'mrp (inr)': 'mrp',
  'price': 'mrp',
  'brand': 'brand',
  'brand name': 'brand',
  'category': 'category',
  'product category': 'category',
  'image 1': 'image_1',
  'image 2': 'image_2',
  'image 3': 'image_3',
  'image url': 'image_1',
  'hsn': 'hsn_code',
  'hsn code': 'hsn_code',
  'fabric': 'fabric_family',
  'fabric type': 'fabric_family',
  'color': 'color_family',
  'colour': 'color_family',
  'sleeve': 'sleeve_type',
  'sleeve type': 'sleeve_type',
  'fit': 'fit_type',
  'occasion': 'occasion',
  'neck': 'neck_collar',
  'neckline': 'neckline',
  'wash care': 'wash_care',
  'description': 'description',
};

function normalizeRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = COLUMN_ALIASES[k.trim().toLowerCase()] ?? k.trim().toLowerCase().replace(/\s+/g, '_');
    out[norm] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

new Worker(
  'parse',
  async (job) => {
    const { emailId } = job.data as { emailId: string; dbJobId: string };
    console.log('[parse]', emailId);

    const attachments = await prisma.attachment.findMany({
      where: { emailId, type: { in: ['EXCEL', 'CSV'] } },
    });

    const allProductIds: string[] = [];

    for (const att of attachments) {
      const url = await presignDownload(att.storageKey);
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());

      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });

      for (const raw of rows) {
        const row = normalizeRow(raw);
        if (!row.sku && !row.title) continue;

        const imageUrls = [row.image_1, row.image_2, row.image_3].filter(Boolean) as string[];
        const product = await prisma.product.create({
          data: {
            emailId,
            sellerId: (await prisma.email.findUnique({ where: { id: emailId } }))!.sellerId,
            sku: row.sku ?? null,
            ean: row.ean ?? null,
            title: row.title ?? null,
            brand: row.brand ?? null,
            category: row.category ?? null,
            mrp: row.mrp ? Number(row.mrp) : null,
            imageUrls,
            status: 'PENDING',
          },
        });

        // Stash known attributes from the sheet
        const knownKeys = ['hsn_code', 'fabric_family', 'color_family', 'sleeve_type', 'fit_type', 'occasion', 'neck_collar', 'neckline', 'wash_care', 'description'];
        for (const key of knownKeys) {
          if (row[key]) {
            await prisma.productAttribute.create({
              data: {
                productId: product.id,
                key,
                value: String(row[key]),
                source: 'SELLER',
              },
            });
          }
        }
        allProductIds.push(product.id);
      }

      await prisma.attachment.update({ where: { id: att.id }, data: { parsedAt: new Date() } });
    }

    await prisma.email.update({ where: { id: emailId }, data: { status: 'PARSED' } });

    // Auto-trigger enrichment
    if (allProductIds.length > 0) {
      await enqueueEnrichment({ emailId });
    }

    return { productsParsed: allProductIds.length };
  },
  { connection, concurrency: 2 },
);

console.log('[parse-worker] ready');
