import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as svc from '../services/product.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth);

r.get('/', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getProducts(req.user.shopId!, req.query as any)));
}));

r.get('/barcode/:barcode', asyncHandler(async (req: any, res) => {
  const p = await svc.getProductByBarcode(req.user.shopId!, req.params.barcode);
  if (!p) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json(ok(p));
}));

r.get('/categories', asyncHandler(async (req: any, res) => res.json(ok(await svc.getCategories(req.user.shopId!)))));
r.get('/brands',     asyncHandler(async (req: any, res) => res.json(ok(await svc.getBrands(req.user.shopId!)))));
r.get('/units',      asyncHandler(async (req: any, res) => res.json(ok(await svc.getUnits(req.user.shopId!)))));

r.post('/categories', requireRole(UserRole.admin), asyncHandler(async (req: any, res) => {
  res.status(201).json(ok(await svc.createCategory(req.user.shopId!, req.body.name, req.body.parentId)));
}));

r.post('/addProduct', requireRole(UserRole.admin, UserRole.stock_adder), asyncHandler(async (req: any, res) => {
  res.status(201).json(ok(await svc.createProduct(req.user.shopId!, { ...req.body, operatorId: req.user.sub })));
}));

r.put('/:id', requireRole(UserRole.admin), asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.updateProduct(req.user.shopId!, parseInt(req.params.id), req.body)));
}));

r.delete('/:id', requireRole(UserRole.admin), asyncHandler(async (req: any, res) => {
  await svc.deleteProduct(req.user.shopId!, parseInt(req.params.id));
  res.json(ok(null, 'Product deleted'));
}));

r.post('/addStock', requireRole(UserRole.admin, UserRole.stock_adder), asyncHandler(async (req: any, res) => {
  // const { productId, qty, purchasePrice, sellingPrice } = req.body;
  const qty = Number(req.query.qty);
  const result = await svc.addStock(req.user.shopId, req.query.barcode,qty);
  res.json(ok(result));
}));

r.post('/addNewBatchStock', requireRole(UserRole.admin, UserRole.stock_adder), asyncHandler(async (req: any, res) => {
  const result = await svc.addNewBatchStock(req.user.shopId, req.body);
  res.json(ok(result));
}));

export default r;
