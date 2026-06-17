/**
 * Sheet worker — produces portal-ready XLSX from validated products.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import * as XLSX from 'xlsx';
import { prisma } from '../db/client';
import { uploadToS3 } from '../services/s3.service';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

const SHEET_COLUMNS = [
  'sku', 'ean', 'title', 'brand', 'category', 'product_type', 'hsn_code', 'mrp',
  'color_family', 'fabric_family', 'fabric_composition', 'sleeve_type', 'fit_type',
  'neck_collar', 'neckline', 'pattern', 'occasion', 'age_band', 'wash_care',
  'country_of_origin', 'manufacturer', 'seo_keywords', 'description',
  'image_1', 'image_2', 'image_3', 'image_4',
];

new Worker(
  'sheet',
  async (job) => {
    const { sellerId } = job.data as { sellerId: string };

    const products = await prisma.product.findMany({
      where: { sellerId, status: 'VALIDATED' },
      include: { attributes: true, images: true },
    });

    const rows = products.map((p) => {
      const attrs = Object.fromEntries(p.attributes.map((a) => [a.key, a.value]));
      const images = p.images.map((i) => i.enhancedUrl ?? i.originalUrl);
      return {
        sku: p.sku, ean: p.ean, title: p.title, brand: p.brand, category: p.category, mrp: p.mrp,
        ...attrs,
        image_1: images[0] ?? p.imageUrls[0], image_2: images[1] ?? p.imageUrls[1],
        image_3: images[2] ?? p.imageUrls[2], image_4: images[3] ?? p.imageUrls[3],
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: SHEET_COLUMNS });
    XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    const key = `master-sheets/${sellerId}/${Date.now()}.xlsx`;
    await uploadToS3(key, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const sheet = await prisma.masterSheet.create({
      data: {
        name: `${seller?.name ?? 'Seller'} — ${new Date().toISOString().slice(0, 10)}`,
        sellerId,
        productCount: products.length,
        storageKey: key,
        status: 'READY',
      },
    });

    return { sheetId: sheet.id, productCount: products.length };
  },
  { connection, concurrency: 1 },
);

console.log('[sheet-worker] ready');
