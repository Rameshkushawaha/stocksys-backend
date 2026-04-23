import { Router } from 'express';
import * as svc from '../services/notification.service';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();
r.use(requireAuth);

r.get('/', asyncHandler(async (req: any, res) => {
  const unreadOnly = req.query.unread === 'true';
  res.json(ok(await svc.getNotifications(req.user.shopId!, unreadOnly)));
}));

r.post('/read', asyncHandler(async (req: any, res) => {
  await svc.markRead(req.user.shopId!, req.body.ids);
  res.json(ok(null, 'Marked as read'));
}));

r.post('/check', asyncHandler(async (req: any, res) => {
  await svc.runAlertChecks(req.user.shopId!);
  res.json(ok(null, 'Alert check complete'));
}));

export default r;
