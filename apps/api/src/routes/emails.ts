import { Router } from 'express';
import { prisma } from '../db/client';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, sellerId, limit = '50' } = req.query;
    const emails = await prisma.email.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(sellerId ? { sellerId: sellerId as string } : {}),
      },
      include: {
        seller: true,
        attachments: true,
        _count: { select: { products: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: Number(limit),
    });
    res.json({ emails, total: emails.length });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const email = await prisma.email.findUnique({
      where: { id: req.params.id },
      include: {
        seller: true,
        attachments: true,
        products: { include: { attributes: true, aiSuggestions: true } },
        communications: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!email) return res.status(404).json({ error: 'Not found' });
    res.json(email);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/request-missing', async (req, res, next) => {
  try {
    // Phase 4: enqueue a SELLER_NOTIFY job that uses Gemini to draft an email
    // listing missing fields, then sends via Gmail API.
    res.json({ ok: true, queued: true, emailId: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
