import { Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { AuthRequest, JwtPayload, fail } from '../types';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

// ─── Verify JWT on every protected route ─────────────────────────────────────
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json(fail('No token provided'));
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    next();
  } catch {
    return res.status(401).json(fail('Invalid or expired token'));
  }
}

// ─── Role-based access guard ──────────────────────────────────────────────────
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json(fail('Unauthenticated'));
    if (!roles.includes(req.user.role)) {
      return res.status(403).json(fail('Insufficient permissions'));
    }
    next();
  };
}

// ─── Shop isolation: user can only access their own shop ─────────────────────
export function requireShopAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const shopId = parseInt(req.params.shopId ?? req.body.shopId ?? '0');
  if (!req.user) return res.status(401).json(fail('Unauthenticated'));
  if (req.user.role === UserRole.super_admin) return next();
  if (shopId && req.user.shopId !== shopId) {
    return res.status(403).json(fail('Access denied to this shop'));
  }
  next();
}
