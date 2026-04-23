import { prisma } from '../prisma';
import { AppError } from '../middleware/error.middleware';
import { PaymentMode } from '@prisma/client';

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export async function getCustomers(shopId: number, search?: string) {
  const where: any = { shopId, isActive: true, deletedAt: null };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { mobile: { contains: search } },
    ];
  }
  return prisma.customer.findMany({
    where, orderBy: { name: 'asc' },
    select: { id: true, name: true, mobile: true, email: true, loyaltyPoints: true, totalSpent: true, totalOrders: true, createdAt: true },
  });
}

export async function getCustomerById(shopId: number, id: number) {
  const customer = await prisma.customer.findFirst({
    where: { id, shopId, deletedAt: null },
    include: {
      sales: { orderBy: { saleDate: 'desc' }, take: 10, select: { id: true, invoiceNo: true, grandTotal: true, saleDate: true, status: true } },
      pointsHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
      credits: { where: { status: { not: 'cleared' } }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

export async function createCustomer(shopId: number, data: { name: string; mobile?: string; email?: string; address?: string; gstNo?: string }) {
  return prisma.customer.create({ data: { shopId, ...data } });
}

export async function updateCustomer(shopId: number, id: number, data: Record<string, any>) {
  const customer = await prisma.customer.findFirst({ where: { id, shopId, deletedAt: null } });
  if (!customer) throw new AppError('Customer not found', 404);
  return prisma.customer.update({ where: { id }, data });
}

// ─── Loyalty Points ───────────────────────────────────────────────────────────
export async function getCustomerPoints(shopId: number, customerId: number) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
  if (!customer) throw new AppError('Customer not found', 404);
  const history = await prisma.customerPoint.findMany({
    where: { customerId }, orderBy: { createdAt: 'desc' }, take: 20,
    include: { sale: { select: { invoiceNo: true } } },
  });
  return { balance: customer.loyaltyPoints, history };
}

// ─── Credit / Udhaar ─────────────────────────────────────────────────────────
export async function getCustomerCredits(shopId: number, customerId?: number) {
  const where: any = { shopId };
  if (customerId) where.customerId = customerId;
  where.status = { not: 'cleared' };
  return prisma.customerCredit.findMany({
    where, orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true, mobile: true } }, payments: true },
  });
}

export async function recordCreditPayment(
  creditId: number,
  amount: number,
  paymentMode: string,
  note: string,
  receivedById?: number
) {
  const credit = await prisma.customerCredit.findUnique({ where: { id: creditId } });
  if (!credit) throw new AppError('Credit record not found', 404);

  const newPaid = Number(credit.amountPaid) + amount;
  const remaining = Number(credit.amountDue) - newPaid;
  const status = remaining <= 0 ? 'cleared' : 'partial';

  return prisma.$transaction(async (tx) => {
    await tx.creditPayment.create({
      data: { creditId, amount, paymentMode: paymentMode as PaymentMode, note, receivedById: receivedById ?? null, paidAt: new Date() },
    });
    return tx.customerCredit.update({
      where: { id: creditId },
      data: { amountPaid: newPaid, status: status as any },
    });
  });
}
