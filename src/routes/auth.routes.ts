import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { loginByPin, logout, getShopUsers, createUser } from '../services/auth.service';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ok } from '../types';

const r = Router();

r.post('/login', asyncHandler(async (req, res) => {
  const { role, pin, shopId } = req.body;
  if (!role || !pin) return res.status(400).json({ success: false, error: 'role and pin required' });
  const result = await loginByPin(role as UserRole, pin, shopId);
  res.json(ok(result, 'Login successful'));
}));

r.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const token = req.headers.authorization!.split(' ')[1];
  await logout(token);
  res.json(ok(null, 'Logged out'));
}));

r.get('/users', requireAuth, requireRole(UserRole.admin, UserRole.super_admin), asyncHandler(async (req: any, res) => {
  const users = await getShopUsers(req.user.shopId!);
  res.json(ok(users));
}));

r.post('/users', requireAuth, requireRole(UserRole.admin, UserRole.super_admin), asyncHandler(async (req: any, res) => {
  const user = await createUser({ shopId: req.user.shopId!, ...req.body });
  res.status(201).json(ok(user));
}));

r.get('/me', requireAuth, asyncHandler(async (req: any, res) => {
  res.json(ok(req.user));
}));

export default r;
