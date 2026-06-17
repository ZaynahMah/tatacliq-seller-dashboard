import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../db/client';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
}) as any;

export const parseQueue = new Queue('parse', { connection });
export const enrichmentQueue = new Queue('enrichment', { connection });
export const imageQueue = new Queue('image', { connection });
export const validateQueue = new Queue('validate', { connection });
export const sheetQueue = new Queue('sheet', { connection });
export const notifyQueue = new Queue('notify', { connection });

const DEFAULT_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
};

export async function enqueueParse(emailId: string) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'EXCEL_PARSE', emailId, status: 'QUEUED' },
  });
  await parseQueue.add('parse', { emailId, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function enqueueEnrichment(payload: { productId?: string; emailId?: string }) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'GEMINI_ENRICH', emailId: payload.emailId, status: 'QUEUED', payload },
  });
  await enrichmentQueue.add('enrich', { ...payload, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function enqueueImage(productImageId: string) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'IMAGE_OUTPAINT', status: 'QUEUED', payload: { productImageId } },
  });
  await imageQueue.add('outpaint', { productImageId, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function enqueueValidation(emailId: string) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'VALIDATE', emailId, status: 'QUEUED' },
  });
  await validateQueue.add('validate', { emailId, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function enqueueSheet(payload: { sellerId: string; emailId?: string }) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'SHEET_GENERATE', emailId: payload.emailId, status: 'QUEUED', payload },
  });
  await sheetQueue.add('sheet', { ...payload, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function enqueueNotify(payload: { emailId: string; missingFields: string[] }) {
  const dbJob = await prisma.queueJob.create({
    data: { type: 'SELLER_NOTIFY', emailId: payload.emailId, status: 'QUEUED', payload },
  });
  await notifyQueue.add('notify', { ...payload, dbJobId: dbJob.id }, DEFAULT_OPTS);
  return dbJob;
}

export async function retryJob(dbJobId: string) {
  const job = await prisma.queueJob.findUnique({ where: { id: dbJobId } });
  if (!job) throw new Error('Job not found');

  await prisma.queueJob.update({
    where: { id: dbJobId },
    data: { status: 'QUEUED', attempts: { increment: 1 }, lastError: null },
  });

  const payload: any = { ...(job.payload as any), dbJobId };

  switch (job.type) {
    case 'EXCEL_PARSE':
      await parseQueue.add('parse', { emailId: job.emailId, dbJobId }, DEFAULT_OPTS);
      break;
    case 'GEMINI_ENRICH':
      await enrichmentQueue.add('enrich', payload, DEFAULT_OPTS);
      break;
    case 'IMAGE_OUTPAINT':
      await imageQueue.add('outpaint', payload, DEFAULT_OPTS);
      break;
    case 'VALIDATE':
      await validateQueue.add('validate', { emailId: job.emailId, dbJobId }, DEFAULT_OPTS);
      break;
    case 'SHEET_GENERATE':
      await sheetQueue.add('sheet', payload, DEFAULT_OPTS);
      break;
    case 'SELLER_NOTIFY':
      await notifyQueue.add('notify', payload, DEFAULT_OPTS);
      break;
  }
}
