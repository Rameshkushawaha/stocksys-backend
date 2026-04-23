import { prisma } from '../prisma';
import { NotificationType } from '@prisma/client';

export async function getNotifications(shopId: number, unreadOnly = false) {
  const where: any = { shopId };
  if (unreadOnly) where.isRead = false;
  return prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
}

export async function markRead(shopId: number, ids?: number[]) {
  const where: any = { shopId };
  if (ids?.length) where.id = { in: ids };
  await prisma.notification.updateMany({ where, data: { isRead: true } });
}

export async function createNotification(shopId: number, type: NotificationType, title: string, message: string, referenceId?: number, referenceType?: string) {
  return prisma.notification.create({ data: { shopId, type, title, message, referenceId, referenceType } });
}

// Run by cron: check low stock and expiry
export async function runAlertChecks(shopId: number) {
  const settings = await prisma.shopSettings.findUnique({ where: { shopId } });
  const threshold = settings?.lowStockThreshold ?? 10;
  const expiryDays = settings?.expiryAlertDays ?? 30;

  // Low stock
  const products = await prisma.product.findMany({ where: { shopId, isActive: true }, include: { stockBatches: { where: { isActive: true } } } });
  for (const p of products) {
    const stock = p.stockBatches.reduce((s, b) => s + b.qtyAvailable, 0);
    if (stock < threshold) {
      const existing = await prisma.notification.findFirst({ where: { shopId, type: 'low_stock', referenceId: p.id, isRead: false } });
      if (!existing) {
        await createNotification(shopId, NotificationType.low_stock, 'Low Stock', `${p.name} has only ${stock} units left`, p.id, 'Product');
      }
    }
  }

  // Expiry
  const cutoff = new Date(Date.now() + expiryDays * 86_400_000);
  const expiring = await prisma.stockBatch.findMany({ where: { shopId, isActive: true, qtyAvailable: { gt: 0 }, expiryDate: { lte: cutoff } }, include: { product: true } });
  for (const b of expiring) {
    const existing = await prisma.notification.findFirst({ where: { shopId, type: 'expiry_alert', referenceId: b.id, isRead: false } });
    if (!existing) {
      const days = Math.ceil(((b.expiryDate?.getTime() ?? 0) - Date.now()) / 86_400_000);
      await createNotification(shopId, NotificationType.expiry_alert, 'Expiry Alert', `${b.product.name} expires in ${days} day(s)`, b.id, 'StockBatch');
    }
  }
}
