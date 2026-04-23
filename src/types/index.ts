import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface JwtPayload {
  sub: number;       // userId
  shopId: number | null;
  role: UserRole;
  name: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface CartItem {
  barcodeId: string;
  quantity: number;
}

export interface CheckoutPayload {
  items: CartItem[];
  customerId?: number;
  paymentMode?: string;
  discountAmount?: number;
  pointsToRedeem?: number;
  notes?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const ok = <T>(data: T, message?: string): ApiResponse<T> => ({
  success: true, data, message,
});

export const fail = (error: string): ApiResponse => ({
  success: false, error,
});
