import { Router } from 'express';
import { prisma } from '../db/client';
import { retryJob } from '../services/queue.service';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, type, limit = '50' } = req.query;
    const jobs = await prisma.queueJob.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(type ? { type: type as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    const summary = await prisma.queueJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    res.json({ jobs, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/retry', async (req, res, next) => {
  try {
    await retryJob(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
