import { prisma } from '../prisma';
import { AppError } from '../middleware/error.middleware';

export interface FifoAllocation {
  batchId: number;
  qty: number;
  unitPrice: number;
}

/**
 * Allocates stock from oldest batches (FIFO).
 * Returns an array of { batchId, qty, unitPrice } to consume.
 * Throws if insufficient total stock.
 */
export async function allocateFifo(
  shopId: number,
  productId: number,
  qtyNeeded: number
): Promise<FifoAllocation[]> {
  // Fetch batches oldest-first with available stock
  const batches = await prisma.stockBatch.findMany({
    where: { shopId, productId, isActive: true, qtyAvailable: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
  });

  const totalAvailable = batches.reduce((s, b) => s + b.qtyAvailable, 0);
  if (totalAvailable < qtyNeeded) {
    throw new AppError(`Insufficient stock. Available: ${totalAvailable}`, 400);
  }

  const allocations: FifoAllocation[] = [];
  let remaining = qtyNeeded;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.qtyAvailable, remaining);
    allocations.push({ batchId: batch.id, qty: take, unitPrice: Number(batch.sellingPrice) });
    remaining -= take;
  }

  return allocations;
}

/**
 * Commits FIFO allocation — actually decrements the batch quantities.
 * Call inside a prisma.$transaction.
 */
export async function commitFifo(
  tx: any,
  allocations: FifoAllocation[]
): Promise<void> {
  for (const a of allocations) {
    await tx.stockBatch.update({
      where: { id: a.batchId },
      data: { qtyAvailable: { decrement: a.qty } },
    });
  }
}

/**
 * Returns stock (sale return / purchase return) back to a specific batch
 */
export async function returnToStock(
  tx: any,
  batchId: number,
  qty: number
): Promise<void> {
  await tx.stockBatch.update({
    where: { id: batchId },
    data: { qtyAvailable: { increment: qty } },
  });
}
