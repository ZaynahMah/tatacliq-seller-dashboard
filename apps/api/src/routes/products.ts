import { Router } from 'express';
import { prisma } from '../db/client';
import { enqueueEnrichment } from '../services/queue.service';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { emailId, status } = req.query;
    const products = await prisma.product.findMany({
      where: {
        ...(emailId ? { emailId: emailId as string } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: { attributes: true, aiSuggestions: true, validationIssues: true },
    });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        attributes: true,
        aiSuggestions: { orderBy: { createdAt: 'desc' } },
        validationIssues: true,
        images: true,
      },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/enrich', async (req, res, next) => {
  try {
    const job = await enqueueEnrichment({ productId: req.params.id });
    res.json({ ok: true, jobId: job.id });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/suggestions/:suggestionId/accept', async (req, res, next) => {
  try {
    const suggestion = await prisma.aISuggestion.update({
      where: { id: req.params.suggestionId },
      data: { status: 'ACCEPTED', reviewedAt: new Date() },
    });
    // Write into ProductAttribute as authoritative value
    await prisma.productAttribute.upsert({
      where: { productId_key: { productId: req.params.id, key: suggestion.fieldKey } },
      create: {
        productId: req.params.id,
        key: suggestion.fieldKey,
        value: suggestion.suggestedValue,
        source: suggestion.source,
        confidence: suggestion.confidence,
      },
      update: {
        value: suggestion.suggestedValue,
        source: suggestion.source,
        confidence: suggestion.confidence,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
