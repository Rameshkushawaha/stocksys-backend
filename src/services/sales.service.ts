import { prisma } from '../prisma';
import { PaymentMode, SaleStatus, TransactionType } from '@prisma/client';
import { allocateFifo, commitFifo } from '../utils/fifo';
import { calcBillTotals } from '../utils/gst';
import { nextInvoiceNo } from '../utils/invoice';
import { AppError } from '../middleware/error.middleware';
import { CartItem, CheckoutPayload } from '../types';

// ─── Checkout ─────────────────────────────────────────────────────────────────
export async function checkout(shopId: number, payload: CheckoutPayload, operatorId?: number) {
  const { items, customerId, paymentMode = 'Cash', discountAmount = 0, pointsToRedeem = 0, notes } = payload;

  if (!items?.length) throw new AppError('Cart is empty', 400);

  // Load shop settings (GST included flag, loyalty ratio)
  const settings = await prisma.shopSettings.findUnique({ where: { shopId } });
  const taxIncluded = settings?.taxIncluded ?? false;
  const pointsRatio = settings?.pointsRedeemRatio ?? 0.25;
  const pointsPerRupee = settings?.pointsPerRupee ?? 1;

  // Load products + FIFO allocation
  const resolvedItems = await Promise.all(
    items.map(async (item: CartItem) => {
      const product = await prisma.product.findFirst({
        where: { shopId, barcode: item.barcodeId, isActive: true, deletedAt: null },
        include: { unit: true },
      });
      if (!product) throw new AppError(`Product not found: ${item.barcodeId}`, 404);

      const fifo = await allocateFifo(shopId, product.id, item.quantity);
      const rate = fifo[0].unitPrice; // FIFO selling price

      return { product, qty: item.quantity, rate, fifo };
    })
  );

  // Calculate bill totals
  const lineInputs = resolvedItems.map(r => ({
    qty: r.qty, rate: r.rate,
    taxPercent: r.product.taxPercent,
    cessPercent: r.product.cessPercent ?? 0,
  }));
  const bill = calcBillTotals(lineInputs, taxIncluded);

  // Points redemption
  let pointsDiscount = 0;
  if (pointsToRedeem > 0 && customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!customer) throw new AppError('Customer not found', 404);
    if (customer.loyaltyPoints < pointsToRedeem) throw new AppError('Insufficient loyalty points', 400);
    pointsDiscount = pointsToRedeem * pointsRatio;
  }

  const totalDiscount = discountAmount + pointsDiscount;
  const finalTotal = Math.max(0, bill.grandTotal - totalDiscount);
  const roundOff = Math.round(finalTotal) - finalTotal;
  const grandTotal = Math.round(finalTotal);

  const amountPaid = grandTotal; // Can be split in mixed payments
  const pointsEarned = settings?.enableLoyalty ? Math.floor(grandTotal * pointsPerRupee) : 0;

  const invoiceNo = await nextInvoiceNo(shopId);

  // ── All DB writes in one transaction ───────────────────────────────────────
  const sale = await prisma.$transaction(async (tx) => {
    // 1. Create sale header
    const sale = await tx.sale.create({
      data: {
        shopId, invoiceNo, customerId: customerId ?? null,
        operatorId: operatorId ?? null,
        subtotal: bill.subtotal,
        discountAmount: totalDiscount,
        taxAmount: bill.totalTax,
        cessAmount: bill.totalCess,
        roundOff,
        grandTotal,
        amountPaid,
        pointsEarned,
        pointsRedeemed: pointsToRedeem,
        paymentMode: paymentMode as PaymentMode,
        status: paymentMode === 'Credit' ? SaleStatus.completed : SaleStatus.completed,
        notes: notes ?? null,
      },
    });

    // 2. Create sale items + stock transactions
    for (let i = 0; i < resolvedItems.length; i++) {
      const r = resolvedItems[i];
      const b = bill.items[i];

      // Use first FIFO batch for item (multi-batch: create multiple items)
      for (const alloc of r.fifo) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: r.product.id,
            batchId: alloc.batchId,
            productName: r.product.name,
            barcodeSnapshot: r.product.barcode ?? '',
            qty: alloc.qty,
            rate: alloc.unitPrice,
            taxPercent: r.product.taxPercent,
            taxAmount: b.taxAmount * (alloc.qty / r.qty),
            cessPercent: r.product.cessPercent ?? 0,
            cessAmount: b.cessAmount * (alloc.qty / r.qty),
            lineTotal: alloc.qty * alloc.unitPrice,
          },
        });

        // Stock out
        await tx.stockBatch.update({
          where: { id: alloc.batchId },
          data:  { qtyAvailable: { decrement: alloc.qty } },
        });

        // Audit trail
        const remaining = await tx.stockBatch.findUnique({ where: { id: alloc.batchId }, select: { qtyAvailable: true } });
        await tx.stockTransaction.create({
          data: {
            shopId, productId: r.product.id, batchId: alloc.batchId,
            type: TransactionType.sale, qty: -alloc.qty,
            balanceAfter: remaining?.qtyAvailable ?? 0,
            referenceId: sale.id, referenceType: 'Sale',
            operatorId: operatorId ?? null,
          },
        });
      }
    }

    // 3. Loyalty points
    if (customerId && pointsEarned > 0) {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      const newBalance = (customer?.loyaltyPoints ?? 0) + pointsEarned - pointsToRedeem;
      await tx.customer.update({
        where: { id: customerId },
        data: {
          loyaltyPoints: { increment: pointsEarned - pointsToRedeem },
          totalSpent: { increment: grandTotal },
          totalOrders: { increment: 1 },
        },
      });
      await tx.customerPoint.create({
        data: { customerId, saleId: sale.id, pointsEarned, pointsUsed: pointsToRedeem, balanceAfter: newBalance },
      });
    }

    // 4. Credit (udhaar) record
    if (paymentMode === 'Credit' && customerId) {
      await tx.customerCredit.create({
        data: { customerId, shopId, saleId: sale.id, amountDue: grandTotal, dueDate: new Date(Date.now() + 30 * 86_400_000) },
      });
    }

    // 5. Notify low stock
    for (const r of resolvedItems) {
      const agg = await tx.stockBatch.aggregate({ where: { productId: r.product.id, isActive: true }, _sum: { qtyAvailable: true } });
      const remaining = agg._sum.qtyAvailable ?? 0;
      if (remaining < r.product.minStock) {
        await tx.notification.create({
          data: {
            shopId, type: 'low_stock',
            title: 'Low Stock Alert',
            message: `${r.product.name} has only ${remaining} units remaining`,
            referenceId: r.product.id, referenceType: 'Product',
          },
        });
      }
    }

    return sale;
  });

  return getSaleById(sale.id);
}

// ─── Get sale by ID ───────────────────────────────────────────────────────────
export async function getSaleById(id: number) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { name: true, barcode: true, hsnCode: true, taxPercent: true } } } },
      customer: { select: { id: true, name: true, mobile: true } },
      operator: { select: { id: true, name: true } },
    },
  });
}

// ─── Get recent sales ─────────────────────────────────────────────────────────
export async function getSales(shopId: number, query: any) {
  const { from, to, customerId, limit = '20', page = '1' } = query;
  const take = parseInt(limit);
  const skip = (parseInt(page) - 1) * take;
  const where: any = { shopId };
  if (from || to) where.saleDate = {};
  if (from) where.saleDate.gte = new Date(from);
  if (to)   where.saleDate.lte = new Date(to);
  if (customerId) where.customerId = parseInt(customerId);

  const [total, sales] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where, take, skip, orderBy: { saleDate: 'desc' },
      include: {
        items:    { select: { id: true, productName: true, qty: true, rate: true, lineTotal: true } },
        customer: { select: { id: true, name: true, mobile: true } },
        operator: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { total, page: parseInt(page), limit: take, data: sales };
}

// ─── Process sale return ──────────────────────────────────────────────────────
export async function processSaleReturn(
  shopId: number,
  saleId: number,
  returnItems: Array<{ saleItemId: number; qty: number }>,
  reason: string,
  refundMode: string,
  operatorId?: number
) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, shopId }, include: { items: true } });
  if (!sale) throw new AppError('Sale not found', 404);
  if (sale.status === SaleStatus.voided) throw new AppError('Cannot return a voided sale', 400);

  let refundTotal = 0;
  const returnData: Array<{ saleItemId: number; productId: number; qty: number; batchId: number | null; refundAmount: number }> = [];

  for (const ri of returnItems) {
    const saleItem = sale.items.find(i => i.id === ri.saleItemId);
    if (!saleItem) throw new AppError(`Sale item ${ri.saleItemId} not found`, 404);
    if (ri.qty > saleItem.qty) throw new AppError(`Return qty exceeds sold qty`, 400);

    const refundAmount = Math.round((Number(saleItem.lineTotal) / saleItem.qty) * ri.qty * 100) / 100;
    refundTotal += refundAmount;
    returnData.push({ saleItemId: ri.saleItemId, productId: saleItem.productId, qty: ri.qty, batchId: saleItem.batchId, refundAmount });
  }

  return prisma.$transaction(async (tx) => {
    const saleReturn = await tx.saleReturn.create({
      data: {
        shopId, saleId, reason, refundAmount: refundTotal,
        refundMode: refundMode as PaymentMode, operatorId: operatorId ?? null,
        items: { create: returnData.map(r => ({ saleItemId: r.saleItemId, productId: r.productId, qty: r.qty, refundAmount: r.refundAmount })) },
      },
      include: { items: true },
    });

    // Restock returned items
    for (const r of returnData) {
      if (r.batchId) {
        await tx.stockBatch.update({ where: { id: r.batchId }, data: { qtyAvailable: { increment: r.qty } } });
        const b = await tx.stockBatch.findUnique({ where: { id: r.batchId } });
        await tx.stockTransaction.create({
          data: {
            shopId, productId: r.productId, batchId: r.batchId,
            type: TransactionType.sale_return, qty: r.qty,
            balanceAfter: b?.qtyAvailable ?? 0,
            referenceId: saleReturn.id, referenceType: 'SaleReturn',
            operatorId: operatorId ?? null,
          },
        });
      }
    }

    await tx.sale.update({ where: { id: saleId }, data: { status: SaleStatus.partial_return } });
    return saleReturn;
  });
}
