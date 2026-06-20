import { Router } from 'express';
import { exchangeCodeForTokens, syncInbox, getAuthUrl } from '../services/gmail.service';

const router = Router();

router.get('/auth-url', (_req, res) => {
  res.json({ url: getAuthUrl() });
});

router.post('/exchange', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const tokens = await exchangeCodeForTokens(code);
    res.json({ ok: true, hasRefreshToken: Boolean(tokens.refresh_token) });
  } catch (err) {
    next(err);
  }
});

router.post('/sync', async (_req, res, next) => {
  try {
    const result = await syncInbox();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
