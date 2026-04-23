import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as svc from '../services/report.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth, requireRole(UserRole.admin, UserRole.accountant, UserRole.seller));

r.get('/dashboard', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getDashboardStats(req.user.shopId!)));
}));

r.get('/demand', asyncHandler(async (req: any, res) => {
  const days = parseInt(req.query.days as string) || 30;
  res.json(ok(await svc.getDemandReport(req.user.shopId!, days)));
}));

r.get('/gst', asyncHandler(async (req: any, res) => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ success: false, error: 'from and to dates required' });
  res.json(ok(await svc.getGstReport(req.user.shopId!, from, to)));
}));

r.get('/stock-ledger/:productId', asyncHandler(async (req: any, res) => {
  const { from, to } = req.query as Record<string, string>;
  res.json(ok(await svc.getStockLedger(req.user.shopId!, parseInt(req.params.productId), from, to)));
}));

r.get('/expiry', asyncHandler(async (req: any, res) => {
  const days = parseInt(req.query.days as string) || 30;
  res.json(ok(await svc.getExpiryAlerts(req.user.shopId!, days)));
}));

r.get('/top-customers', asyncHandler(async (req: any, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  res.json(ok(await svc.getTopCustomers(req.user.shopId!, limit)));
}));

export default r;
