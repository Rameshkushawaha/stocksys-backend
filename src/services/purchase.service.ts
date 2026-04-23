import { prisma } from '../prisma';
import { PaymentMode, PurchaseStatus, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';

export interface PurchaseItemInput {
  productId: number;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp?: number;
  taxPercent?: number;
  expiryDate?: string;
  batchNo?: string;
}

// ─── Create purchase + receive stock (FIFO batches) ───────────────────────────
export async function createPurchase(
  shopId: number,
  data: {
    supplierId?: number;
    invoiceNo?: string;
    paymentMode?: string;
    notes?: string;
    purchasedAt?: string;
    items: PurchaseItemInput[];
  },
  operatorId?: number
) {
  const subtotal = data.items.reduce((s, i) => s + i.qty * i.purchasePrice, 0);
  const taxTotal = data.items.reduce((s, i) => s + i.qty * i.purchasePrice * ((i.taxPercent ?? 0) / 100), 0);
  const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        shopId,
        supplierId:  data.supplierId ?? null,
        invoiceNo:   data.invoiceNo ?? null,
        totalAmount: subtotal,
        taxAmount:   taxTotal,
        grandTotal,
        paymentMode: (data.paymentMode ?? 'Cash') as PaymentMode,
        status:      PurchaseStatus.received,
        notes:       data.notes ?? null,
        purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : new Date(),
        operatorId:  operatorId ?? null,
        items: {
          create: data.items.map(i => ({
            productId:     i.productId,
            qty:           i.qty,
            purchasePrice: i.purchasePrice,
            sellingPrice:  i.sellingPrice,
            mrp:           i.mrp ?? null,
            taxPercent:    i.taxPercent ?? 0,
            taxAmount:     i.qty * i.purchasePrice * ((i.taxPercent ?? 0) / 100),
            lineTotal:     i.qty * i.purchasePrice,
            expiryDate:    i.expiryDate ? new Date(i.expiryDate) : null,
            batchNo:       i.batchNo ?? null,
          })),
        },
      },
    });

    // Create FIFO batch + stock transaction per item
    for (const item of data.items) {
      const batch = await tx.stockBatch.create({
        data: {
          shopId,
          productId:     item.productId,
          purchaseId:    purchase.id,
          batchNo:       item.batchNo ?? null,
          purchasePrice: item.purchasePrice,
          sellingPrice:  item.sellingPrice,
          mrp:           item.mrp ?? null,
          qtyReceived:   item.qty,
          qtyAvailable:  item.qty,
          expiryDate:    item.expiryDate ? new Date(item.expiryDate) : null,
        },
      });

      // Get current total stock for balance calculation
      const agg = await tx.stockBatch.aggregate({
        where: { productId: item.productId, shopId, isActive: true },
        _sum:  { qtyAvailable: true },
      });

      await tx.stockTransaction.create({
        data: {
          shopId,
          productId:     item.productId,
          batchId:       batch.id,
          type:          TransactionType.purchase,
          qty:           item.qty,
          balanceAfter:  agg._sum.qtyAvailable ?? item.qty,
          unitCost:      item.purchasePrice,
          referenceId:   purchase.id,
          referenceType: 'Purchase',
          operatorId:    operatorId ?? null,
        },
      });

      // Update selling price on all existing batches if changed
      await tx.stockBatch.updateMany({
        where: { productId: item.productId, shopId, isActive: true, id: { not: batch.id } },
        data:  { sellingPrice: item.sellingPrice },
      });
    }

    return tx.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: { include: { product: { select: { name: true, barcode: true } } } }, supplier: true },
    });
  });
}

// ─── Get purchases ────────────────────────────────────────────────────────────
export async function getPurchases(shopId: number, query: any) {
  const { from, to, supplierId, limit = '20', page = '1' } = query;
  const take = parseInt(limit);
  const skip = (parseInt(page) - 1) * take;
  const where: any = { shopId };
  if (from || to) where.purchasedAt = {};
  if (from) where.purchasedAt.gte = new Date(from);
  if (to)   where.purchasedAt.lte = new Date(to);
  if (supplierId) where.supplierId = parseInt(supplierId);

  const [total, purchases] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where, take, skip, orderBy: { purchasedAt: 'desc' },
      include: {
        items:    { select: { id: true, qty: true, purchasePrice: true, lineTotal: true, product: { select: { name: true, barcode: true } } } },
        supplier: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { total, page: parseInt(page), limit: take, data: purchases };
}

// ─── Manual stock adjustment ──────────────────────────────────────────────────
export async function adjustStock(
  shopId: number,
  productId: number,
  qty: number,             // positive = add, negative = remove
  type: 'adjustment_in' | 'adjustment_out' | 'opening_stock',
  note: string,
  operatorId?: number
) {
  const product = await prisma.product.findFirst({ where: { id: productId, shopId } });
  if (!product) throw new AppError('Product not found', 404);

  return prisma.$transaction(async (tx) => {
    // Find or create a generic batch for adjustments
    let batch = await tx.stockBatch.findFirst({
      where: { productId, shopId, purchaseId: null, isActive: true },
    });

    if (!batch) {
      batch = await tx.stockBatch.create({
        data: { shopId, productId, purchasePrice: 0, sellingPrice: 0, qtyReceived: 0, qtyAvailable: 0 },
      });
    }

    const newQty = Math.max(0, batch.qtyAvailable + qty);
    await tx.stockBatch.update({ where: { id: batch.id }, data: { qtyAvailable: newQty } });

    const agg = await tx.stockBatch.aggregate({ where: { productId, shopId, isActive: true }, _sum: { qtyAvailable: true } });

    await tx.stockTransaction.create({
      data: {
        shopId, productId, batchId: batch.id,
        type: type as any, qty, balanceAfter: agg._sum.qtyAvailable ?? 0,
        note, referenceType: 'Adjustment', operatorId: operatorId ?? null,
      },
    });

    return { productId, newStock: agg._sum.qtyAvailable ?? 0 };
  });
}

// ─── Get suppliers ────────────────────────────────────────────────────────────
export async function getSuppliers(shopId: number) {
  return prisma.supplier.findMany({ where: { shopId, isActive: true, deletedAt: null }, orderBy: { name: 'asc' } });
}

export async function createSupplier(shopId: number, data: { name: string; mobile?: string; email?: string; address?: string; gstNo?: string }) {
  return prisma.supplier.create({ data: { shopId, ...data } });
}
