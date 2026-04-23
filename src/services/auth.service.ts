import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma';
import { JwtPayload } from '../types';
import { AppError } from '../middleware/error.middleware';

const JWT_SECRET  = process.env.JWT_SECRET  ?? 'change-me-in-production-jai-mata-di-maiya-ki-jai-jai-shree-ram';
const JWT_EXPIRES_IN: jwt.SignOptions["expiresIn"] = '8d';
const SALT = 10;

// ─── Login by role + PIN ──────────────────────────────────────────────────────
export async function loginByPin(role: UserRole, pin: string, shopId?: number) {
  const where: any = { role, isActive: true };
  if (shopId) where.shopId = shopId;

  const users = await prisma.user.findMany({ where });
  if (!users.length) throw new AppError('No active user with this role', 401);

  let matched = null;
  for (const u of users) {
    const ok = await bcrypt.compare(pin, u.pinHash);
    if (ok) { matched = u; break; }
  }
  if (!matched) throw new AppError('Invalid PIN', 401);

  const payload: JwtPayload = {
    sub: matched.id, shopId: matched.shopId, role: matched.role, name: matched.name,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  await prisma.user.update({ where: { id: matched.id }, data: { lastLoginAt: new Date() } });
  await prisma.session.create({
    data: { userId: matched.id, token, expiresAt: new Date(Date.now() + 8 * 3_600_000) },
  });

  return {
    user: { id: matched.id, name: matched.name, role: matched.role, shopId: matched.shopId, avatar: matched.avatar },
    token,
  };
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

// ─── Hash a plain PIN ────────────────────────────────────────────────────────
export const hashPin = (pin: string) => bcrypt.hash(pin, SALT);

// ─── Get all users for a shop ─────────────────────────────────────────────────
export async function getShopUsers(shopId: number) {
  return prisma.user.findMany({
    where: { shopId, deletedAt: null },
    select: { id: true, name: true, email: true, mobile: true, role: true, avatar: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
}

// ─── Create user ─────────────────────────────────────────────────────────────
export async function createUser(data: { shopId: number; name: string; email?: string; pin: string; role: UserRole; avatar?: string }) {
  const pinHash = await hashPin(data.pin);
  return prisma.user.create({
    data: { ...data, pinHash, avatar: data.avatar ?? data.name[0] },
    select: { id: true, name: true, email: true, role: true, avatar: true, isActive: true },
  });
}
