import { prisma } from '../prisma';
import { TransactionType } from '@prisma/client';

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats(shopId: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);

  const [
    totalProducts, lowStockCount, totalSuppliers, totalCustomers,
    todaySales, monthSales, allSales, totalStockValue,
    pendingCredits, unreadNotifications,
  ] = await Promise.all([
    prisma.product.count({ where: { shopId, isActive: true, deletedAt: null } }),
    prisma.stockBatch.groupBy({
      by: ['productId'], where: { shopId, isActive: true },
      having: { qtyAvailable: { _sum: { lt: 10 } } },
    }).then(r => r.length),
    prisma.supplier.count({ where: { shopId, isActive: true } }),
    prisma.customer.count({ where: { shopId, isActive: true } }),
    prisma.sale.aggregate({ where: { shopId, saleDate: { gte: today } }, _sum: { grandTotal: true }, _count: true }),
    prisma.sale.aggregate({ where: { shopId, saleDate: { gte: month } }, _sum: { grandTotal: true }, _count: true }),
    prisma.sale.aggregate({ where: { shopId }, _sum: { grandTotal: true }, _count: true }),
    prisma.stockBatch.aggregate({ where: { shopId, isActive: true }, _sum: { qtyAvailable: true } }),
    prisma.customerCredit.aggregate({ where: { shopId, status: { not: 'cleared' } }, _sum: { amountDue: true } }),
    prisma.notification.count({ where: { shopId, isRead: false } }),
  ]);

  return {
    totalProducts, lowStockCount, totalSuppliers, totalCustomers,
    today:   { sales: todaySales._count,  revenue: Number(todaySales._sum.grandTotal ?? 0) },
    month:   { sales: monthSales._count,  revenue: Number(monthSales._sum.grandTotal ?? 0) },
    overall: { sales: allSales._count,    revenue: Number(allSales._sum.grandTotal ?? 0) },
    totalStockUnits: totalStockValue._sum.qtyAvailable ?? 0,
    pendingCreditAmount: Number(pendingCredits._sum.amountDue ?? 0),
    unreadNotifications,
  };
}

// ─── Demand / Sales velocity ──────────────────────────────────────────────────
export async function getDemandReport(shopId: number, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await prisma.saleItem.groupBy({
    by:     ['productId'],
    where:  { sale: { shopId, saleDate: { gte: since }, status: { not: 'voided' } } },
    _sum:   { qty: true, lineTotal: true },
    orderBy: { _sum: { qty: 'desc' } },
  });

  if (!rows.length) return [];

  const maxQty = rows[0]._sum.qty ?? 1;
  const products = await prisma.product.findMany({
    where: { id: { in: rows.map(r => r.productId) } },
    include: { category: { select: { name: true } }, stockBatches: { where: { isActive: true }, select: { qtyAvailable: true } } },
  });

  return rows.map(r => {
    const p = products.find(p => p.id === r.productId)!;
    const stock = p.stockBatches.reduce((s, b) => s + b.qtyAvailable, 0);
    const qty = r._sum.qty ?? 0;
    return {
      productId: p.id, barcode: p.barcode, name: p.name,
      category: p.category?.name,
      unitsSold: qty, revenue: Number(r._sum.lineTotal ?? 0),
      demandPercent: Math.round((qty / maxQty) * 100),
      currentStock: stock, isLowStock: stock < p.minStock,
    };
  });
}

// ─── GST Report ───────────────────────────────────────────────────────────────
export async function getGstReport(shopId: number, from: string, to: string) {
  const sales = await prisma.sale.findMany({
    where: { shopId, saleDate: { gte: new Date(from), lte: new Date(to) }, status: { not: 'voided' } },
    include: { items: { select: { qty: true, rate: true, taxPercent: true, taxAmount: true, cessAmount: true, lineTotal: true, product: { select: { hsnCode: true, name: true } } } } },
  });

  // Group by HSN + tax rate
  const hsnMap: Record<string, any> = {};
  for (const sale of sales) {
    for (const item of sale.items) {
      const key = `${item.product.hsnCode ?? 'UNKNOWN'}_${item.taxPercent}`;
      if (!hsnMap[key]) {
        hsnMap[key] = { hsnCode: item.product.hsnCode ?? 'UNKNOWN', taxPercent: item.taxPercent, taxableValue: 0, cgst: 0, sgst: 0, total: 0 };
      }
      hsnMap[key].taxableValue += Number(item.lineTotal) - Number(item.taxAmount);
      hsnMap[key].cgst         += Number(item.taxAmount) / 2;
      hsnMap[key].sgst         += Number(item.taxAmount) / 2;
      hsnMap[key].total        += Number(item.lineTotal);
    }
  }

  return {
    from, to,
    totalRevenue:   sales.reduce((s, sale) => s + Number(sale.grandTotal), 0),
    totalTax:       sales.reduce((s, sale) => s + Number(sale.taxAmount), 0),
    hsnSummary:     Object.values(hsnMap).sort((a, b) => b.taxableValue - a.taxableValue),
  };
}

// ─── Stock Ledger (per product) ───────────────────────────────────────────────
export async function getStockLedger(shopId: number, productId: number, from?: string, to?: string) {
  const where: any = { shopId, productId };
  if (from || to) where.createdAt = {};
  if (from) where.createdAt.gte = new Date(from);
  if (to)   where.createdAt.lte = new Date(to);

  const [product, transactions] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, shopId }, include: { category: { select: { name: true } } } }),
    prisma.stockTransaction.findMany({ where, orderBy: { createdAt: 'asc' }, include: { operator: { select: { name: true } } } }),
  ]);

  const currentStock = await prisma.stockBatch.aggregate({
    where: { productId, shopId, isActive: true }, _sum: { qtyAvailable: true },
  });

  return { product, currentStock: currentStock._sum.qtyAvailable ?? 0, ledger: transactions };
}

// ─── Expiry Alerts ────────────────────────────────────────────────────────────
export async function getExpiryAlerts(shopId: number, withinDays = 30) {
  const cutoff = new Date(Date.now() + withinDays * 86_400_000);
  return prisma.stockBatch.findMany({
    where: { shopId, isActive: true, qtyAvailable: { gt: 0 }, expiryDate: { lte: cutoff } },
    include: { product: { select: { name: true, barcode: true, category: { select: { name: true } } } } },
    orderBy: { expiryDate: 'asc' },
  });
}

// ─── Top customers ────────────────────────────────────────────────────────────
export async function getTopCustomers(shopId: number, limit = 10) {
  return prisma.customer.findMany({
    where: { shopId, isActive: true },
    orderBy: { totalSpent: 'desc' },
    take: limit,
    select: { id: true, name: true, mobile: true, loyaltyPoints: true, totalSpent: true, totalOrders: true },
  });
}
