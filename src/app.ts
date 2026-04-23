import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes         from './routes/auth.routes';
import productRoutes      from './routes/product.routes';
import salesRoutes        from './routes/sales.routes';
import purchaseRoutes     from './routes/purchase.routes';
import customerRoutes     from './routes/customer.routes';
import reportRoutes       from './routes/report.routes';
import notificationRoutes from './routes/notification.routes';

import { errorHandler, notFound } from './middleware/error.middleware';

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:4200'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
const api = '/api';
app.use(`${api}/auth`,          authRoutes);
app.use(`${api}/products`,      productRoutes);
app.use(`${api}/sales`,         salesRoutes);
app.use(`${api}/purchases`,     purchaseRoutes);
app.use(`${api}/customers`,     customerRoutes);
app.use(`${api}/reports`,       reportRoutes);
app.use(`${api}/notifications`, notificationRoutes);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
