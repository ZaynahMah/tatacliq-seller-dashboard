import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import emailsRouter from './routes/emails';
import productsRouter from './routes/products';
import jobsRouter from './routes/jobs';
import gmailRouter from './routes/gmail';
import sheetsRouter from './routes/sheets';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'tatacliq-api',
    version: '0.1.0',
    uptime: process.uptime(),
    monitoredAccount: process.env.GMAIL_MONITORED_ACCOUNT,
  });
});

app.use('/emails', emailsRouter);
app.use('/products', productsRouter);
app.use('/jobs', jobsRouter);
app.use('/gmail', gmailRouter);
app.use('/sheets', sheetsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
  console.log(`[api] monitoring ${process.env.GMAIL_MONITORED_ACCOUNT ?? '(no Gmail account set)'}`);
});
