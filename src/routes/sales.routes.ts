import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as svc from '../services/sales.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth);

r.get('/', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getSales(req.user.shopId!, req.query)));
}));

r.get('/:id', asyncHandler(async (req: any, res) => {
  const sale = await svc.getSaleById(parseInt(req.params.id));
  if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
  res.json(ok(sale));
}));

r.post('/checkout', requireRole(UserRole.admin, UserRole.seller), asyncHandler(async (req: any, res) => {
  const sale = await svc.checkout(req.user.shopId!, req.body, req.user.sub);
  res.status(201).json(ok(sale));
}));

r.post('/:id/return', requireRole(UserRole.admin, UserRole.seller), asyncHandler(async (req: any, res) => {
  const result = await svc.processSaleReturn(
    req.user.shopId!, parseInt(req.params.id),
    req.body.items, req.body.reason, req.body.refundMode, req.user.sub
  );
  res.json(ok(result));
}));

export default r;
