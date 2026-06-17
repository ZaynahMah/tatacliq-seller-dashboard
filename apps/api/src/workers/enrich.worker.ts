/**
 * Enrichment worker — for each product missing fields, call the Python
 * Gemini service and persist suggestions.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../db/client';
import { enqueueValidation } from '../services/queue.service';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

const PYTHON_URL = process.env.PYTHON_WORKER_URL ?? 'http://localhost:8000';

const MANDATORY = [
  'product_type', 'hsn_code', 'sku', 'title', 'seo_keywords', 'description',
  'fabric_family', 'sleeve_type', 'age_band', 'brand_description', 'fit_type',
  'features', 'wash_care', 'neck_collar', 'occasion', 'pattern', 'color_family',
  'mrp', 'fabric_composition', 'size_chart', 'country_of_origin', 'manufacturer',
  'ean', 'cuff_style', 'hemline', 'transparency', 'branding_logo', 'pocket_type',
  'neckline', 'stitching',
];

new Worker(
  'enrichment',
  async (job) => {
    const { productId, emailId } = job.data as { productId?: string; emailId?: string };
    const products = await prisma.product.findMany({
      where: productId ? { id: productId } : { emailId, status: { in: ['PENDING', 'ENRICHING'] } },
      include: { attributes: true },
    });

    for (const product of products) {
      await prisma.product.update({ where: { id: product.id }, data: { status: 'ENRICHING' } });

      const known = Object.fromEntries(product.attributes.map((a) => [a.key, a.value]));
      const missing = MANDATORY.filter((f) => !known[f] && !(product as any)[f]);

      if (missing.length === 0) {
        await prisma.product.update({ where: { id: product.id }, data: { status: 'ENRICHED', enrichedAt: new Date() } });
        continue;
      }

      const res = await fetch(`${PYTHON_URL}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          title: product.title,
          brand: product.brand,
          category: product.category,
          image_urls: product.imageUrls,
          known_attributes: known,
          missing_fields: missing,
        }),
      });

      const data = (await res.json()) as { suggestions: Array<{ field: string; value: string; reasoning: string; source: string; confidence: number }>; overall_confidence: number };

      for (const s of data.suggestions) {
        const sourceMap: Record<string, any> = {
          gemini_text: 'GEMINI_TEXT',
          gemini_vision: 'GEMINI_VISION',
          cross_ref: 'CROSS_REF',
        };
        await prisma.aISuggestion.create({
          data: {
            productId: product.id,
            fieldKey: s.field,
            suggestedValue: s.value,
            reasoning: s.reasoning,
            source: sourceMap[s.source] ?? 'GEMINI_TEXT',
            confidence: s.confidence,
          },
        });
      }

      await prisma.product.update({
        where: { id: product.id },
        data: {
          status: 'ENRICHED',
          confidenceScore: data.overall_confidence * 100,
          enrichedAt: new Date(),
        },
      });
    }

    // Kick off validation
    if (emailId) await enqueueValidation(emailId);
    return { enriched: products.length };
  },
  { connection, concurrency: 3 },
);

console.log('[enrich-worker] ready');
