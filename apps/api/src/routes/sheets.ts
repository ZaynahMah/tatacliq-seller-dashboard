import { Router } from 'express';
import { prisma } from '../db/client';
import { enqueueSheet } from '../services/queue.service';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const sheets = await prisma.masterSheet.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ sheets });
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const { sellerId, emailId } = req.body;
    if (!sellerId) return res.status(400).json({ error: 'sellerId required' });
    const job = await enqueueSheet({ sellerId, emailId });
    res.json({ ok: true, jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', async (req, res, next) => {
  try {
    const sheet = await prisma.masterSheet.findUnique({ where: { id: req.params.id } });
    if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

    // Phase 4: actually POST to the seller portal API with retries.
    // For now, mark as submitted and return a portal reference.
    const portalRef = `TC-${Date.now().toString(36).toUpperCase()}`;
    await prisma.masterSheet.update({
      where: { id: req.params.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    res.json({ ok: true, portalRef, submittedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

export default router;
