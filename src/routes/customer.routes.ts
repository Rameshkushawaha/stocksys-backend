import { Router } from 'express';
import * as svc from '../services/customer.service';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth);

r.get('/', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getCustomers(req.user.shopId!, req.query.search as string)));
}));

r.post('/', asyncHandler(async (req: any, res) => {
  res.status(201).json(ok(await svc.createCustomer(req.user.shopId!, req.body)));
}));

r.get('/credits/all', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getCustomerCredits(req.user.shopId!)));
}));

r.post('/credits/:creditId/pay', asyncHandler(async (req: any, res) => {
  const { amount, paymentMode, note } = req.body;
  const result = await svc.recordCreditPayment(
    parseInt(req.params.creditId), amount, paymentMode, note, req.user.sub
  );
  res.json(ok(result));
}));

r.get('/:id', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getCustomerById(req.user.shopId!, parseInt(req.params.id))));
}));

r.put('/:id', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.updateCustomer(req.user.shopId!, parseInt(req.params.id), req.body)));
}));

r.get('/:id/points', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getCustomerPoints(req.user.shopId!, parseInt(req.params.id))));
}));

r.get('/:id/credits', asyncHandler(async (req: any, res) => {
  res.json(ok(await svc.getCustomerCredits(req.user.shopId!, parseInt(req.params.id))));
}));

export default r;
