import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as svc from '../services/purchase.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth, requireRole(UserRole.admin, UserRole.stock_adder));

r.get('/', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getPurchases(req.user.shopId!, req.query)));
}));

r.post('/', asyncHandler(async (req: any, res) => {
  res.status(201).json(ok(await svc.createPurchase(req.user.shopId!, req.body, req.user.sub)));
}));

r.get('/suppliers', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getSuppliers(req.user.shopId!)));
}));

r.post('/suppliers', asyncHandler(async (req: any, res) => {
  res.status(201).json(ok(await svc.createSupplier(req.user.shopId!, req.body)));
}));

r.post('/adjust', asyncHandler(async (req: any, res) => {
  const { productId, qty, type, note } = req.body;
  res.json(ok(await svc.adjustStock(req.user.shopId!, productId, qty, type, note, req.user.sub)));
}));

export default r;
