/**
 * Validation worker — runs portal rules and produces ValidationIssue rows.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../db/client';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

function isValidEAN13(ean: string): boolean {
  if (!/^\d{13}$/.test(ean)) return false;
  const digits = ean.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

new Worker(
  'validate',
  async (job) => {
    const { emailId } = job.data as { emailId: string };
    const products = await prisma.product.findMany({
      where: { emailId },
      include: { attributes: true },
    });

    let issueCount = 0;
    for (const product of products) {
      const attrs = Object.fromEntries(product.attributes.map((a) => [a.key, a.value]));
      const issues: Array<{ field: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string; aiFix?: string }> = [];

      // HSN
      const hsn = attrs.hsn_code;
      if (!hsn) issues.push({ field: 'hsn_code', severity: 'ERROR', message: 'HSN code required for tax compliance' });
      else if (!/^\d{4}(\d{2})?(\d{2})?$/.test(hsn)) issues.push({ field: 'hsn_code', severity: 'ERROR', message: 'HSN must be 4, 6, or 8 digits' });

      // EAN
      if (product.ean && !isValidEAN13(product.ean)) {
        issues.push({ field: 'ean', severity: 'ERROR', message: 'EAN-13 checksum invalid' });
      }

      // Title
      if (!product.title) issues.push({ field: 'title', severity: 'ERROR', message: 'Title is mandatory' });
      else if (product.title.length > 80) issues.push({ field: 'title', severity: 'WARNING', message: 'Title exceeds 80 char portal limit' });
      else if (product.title === product.title.toUpperCase()) issues.push({ field: 'title', severity: 'WARNING', message: 'Title is all caps — convert to Title Case' });

      // MRP
      if (!product.mrp) issues.push({ field: 'mrp', severity: 'ERROR', message: 'MRP required' });
      else if (product.mrp < 99 || product.mrp > 99999) issues.push({ field: 'mrp', severity: 'WARNING', message: 'MRP outside typical range (₹99 – ₹99,999)' });

      // Images
      if (product.imageUrls.length < 3) {
        issues.push({ field: 'images', severity: 'WARNING', message: `Only ${product.imageUrls.length} images — portal recommends 3+` });
      }

      // SKU uniqueness per seller
      if (product.sku) {
        const dupes = await prisma.product.count({
          where: { sellerId: product.sellerId, sku: product.sku, id: { not: product.id } },
        });
        if (dupes > 0) issues.push({ field: 'sku', severity: 'ERROR', message: 'SKU not unique for this seller' });
      }

      // Description: no Tata CLiQ mentions
      if (attrs.description && /tata\s*cliq/i.test(attrs.description)) {
        issues.push({ field: 'description', severity: 'ERROR', message: 'Description must not reference Tata CLiQ' });
      }

      // Persist
      await prisma.validationIssue.deleteMany({ where: { productId: product.id, resolved: false } });
      for (const iss of issues) {
        await prisma.validationIssue.create({
          data: {
            productId: product.id,
            field: iss.field,
            severity: iss.severity,
            message: iss.message,
            aiFix: iss.aiFix,
          },
        });
      }
      issueCount += issues.length;

      const hasErrors = issues.some((i) => i.severity === 'ERROR');
      await prisma.product.update({
        where: { id: product.id },
        data: { status: hasErrors ? 'ENRICHED' : 'VALIDATED' },
      });
    }

    // If everything clean, mark email as VALIDATED
    const anyErrors = await prisma.validationIssue.count({
      where: { product: { emailId }, severity: 'ERROR', resolved: false },
    });
    await prisma.email.update({
      where: { id: emailId },
      data: { status: anyErrors > 0 ? 'AWAITING_SELLER' : 'VALIDATED' },
    });

    return { issues: issueCount };
  },
  { connection, concurrency: 4 },
);

console.log('[validate-worker] ready');
