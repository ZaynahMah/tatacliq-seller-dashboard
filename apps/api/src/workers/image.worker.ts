/**
 * Image worker — calls Python image service to outpaint 1200x1200 -> 1080x1440.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../db/client';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

const PYTHON_IMAGE_URL = process.env.PYTHON_IMAGE_URL ?? 'http://localhost:8001';

new Worker(
  'image',
  async (job) => {
    const { productImageId } = job.data as { productImageId: string };
    const image = await prisma.productImage.findUnique({ where: { id: productImageId } });
    if (!image) return { skipped: true };

    await prisma.productImage.update({
      where: { id: productImageId },
      data: { status: 'PROCESSING' },
    });

    const res = await fetch(`${PYTHON_IMAGE_URL}/outpaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: image.originalUrl,
        target_width: 1080,
        target_height: 1440,
        mode: image.outpaintMode ?? 'fashion_aware',
      }),
    });

    const data = (await res.json()) as {
      enhanced_url: string;
      person_detected: boolean;
      head_crop_risk: number;
      hand_crop_risk: number;
      garment_integrity: number;
    };

    await prisma.productImage.update({
      where: { id: productImageId },
      data: {
        enhancedUrl: data.enhanced_url,
        width: 1080,
        height: 1440,
        personDetected: data.person_detected,
        garmentIntegrity: data.garment_integrity,
        status: data.garment_integrity < 0.85 ? 'PENDING' : 'ENHANCED',
      },
    });

    return data;
  },
  { connection, concurrency: 1 }, // GPU-bound
);

console.log('[image-worker] ready');
