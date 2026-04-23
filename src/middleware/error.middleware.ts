import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { fail } from '../types';

// ─── Wrap async route handlers (no try/catch needed in routes) ────────────────
export const asyncHandler =
  (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ─── Global error handler ─────────────────────────────────────────────────────
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('[ERROR]', err);

  // Prisma unique constraint violation
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json(fail('A record with this value already exists'));
    }
    if (err.code === 'P2025') {
      return res.status(404).json(fail('Record not found'));
    }
  }

  // Validation errors (from manual checks)
  if (err.statusCode) {
    return res.status(err.statusCode).json(fail(err.message));
  }

  // Default
  return res.status(500).json(fail(
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  ));
}

// ─── 404 handler ─────────────────────────────────────────────────────────────
export function notFound(req: Request, res: Response) {
  res.status(404).json(fail(`Route not found: ${req.method} ${req.originalUrl}`));
}

// ─── App error helper ─────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(public message: string, public statusCode = 400) {
    super(message);
  }
}
