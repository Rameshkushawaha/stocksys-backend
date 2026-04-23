import { prisma } from '../prisma';
import { AppError } from '../middleware/error.middleware';
import { TransactionType } from '@prisma/client';

const productSelect = {
  id: true, barcode: true, sku: true, name: true, description: true,
  hsnCode: true, taxPercent: true, taxType: true, cessPercent: true,
  minStock: true, maxStock: true, isWeighed: true, expiryTracked: true,
  imageUrl: true, isActive: true, createdAt: true,
  category: { select: { id: true, name: true } },
  brand:    { select: { id: true, name: true } },
  unit:     { select: { id: true, name: true, abbreviation: true } },
  stockBatches: {
    where: { isActive: true, qtyAvailable: { gt: 0 } },
    select: { id: true, sellingPrice: true, qtyAvailable: true, expiryDate: true },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
  },
  _count: { select: { stockBatches: true } },
};

// ── Get all products for a shop ───────────────────────────────────────────────
export async function getProducts(shopId: number, query?: { search?: string; categoryId?: string; lowStock?: string }) {
  const where: any = { shopId, isActive: true, deletedAt: null };
  if (query?.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { barcode: { contains: query.search } },
      { sku: { contains: query.search } },
    ];
  }
  if (query?.categoryId) where.categoryId = parseInt(query.categoryId);

  const products = await prisma.product.findMany({
    where, select: productSelect, orderBy: { name: 'asc' },
  });

  // Compute currentStock from batches
  const withStock = await Promise.all(products.map(async p => {
    const agg = await prisma.stockBatch.aggregate({
      where: { productId: p.id, isActive: true },
      _sum: { qtyAvailable: true },
    });
    const currentStock = agg._sum.qtyAvailable ?? 0;
    return { ...p, currentStock, isLowStock: currentStock < p.minStock };
  }));

  if (query?.lowStock === 'true') return withStock.filter(p => p.isLowStock);
  return withStock;
}

// ── Get product by barcode ────────────────────────────────────────────────────
export async function getProductByBarcode(shopId: number, barcode: string) {
  const product = await prisma.product.findFirst({
    where: { shopId, barcode, isActive: true, deletedAt: null },
    select: productSelect,
  });
  if (!product) return null;

  const agg = await prisma.stockBatch.aggregate({
    where: { productId: product.id, isActive: true },
    _sum: { qtyAvailable: true },
  });
  const currentStock = agg._sum.qtyAvailable ?? 0;
  return { ...product, currentStock, isLowStock: currentStock < product.minStock };
}

// ── Create product ────────────────────────────────────────────────────────────
export async function createProduct(shopId: number, data: {
  barcode?: string; sku?: string; name: string; description?: string;
  categoryId?: number; brandId?: number; unitId?: number;
  hsnCode?: string; taxPercent?: number; cessPercent?: number;
  minStock?: number; maxStock?: number; isWeighed?: boolean; expiryTracked?: boolean;
  initialStock?: number; purchasePrice?: number; sellingPrice?: number;
  operatorId?: number;
}) {
  // Check barcode uniqueness
  if (data.barcode) {
    const existing = await prisma.product.findFirst({ where: { shopId, barcode: data.barcode, deletedAt: null } });
    if (existing) throw new AppError('Barcode already registered', 409);
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        shopId, barcode: data.barcode, sku: data.sku, name: data.name,
        description: data.description, categoryId: data.categoryId,
        brandId: data.brandId, unitId: data.unitId,
        hsnCode: data.hsnCode, taxPercent: data.taxPercent ?? 18,
        cessPercent: data.cessPercent ?? 0,
        minStock: data.minStock ?? 10, maxStock: data.maxStock,
        isWeighed: data.isWeighed ?? false, expiryTracked: data.expiryTracked ?? false,
      },
    });

    if (data.initialStock && data.initialStock > 0) {
      const batch = await tx.stockBatch.create({
        data: {
          shopId, productId: product.id,
          purchasePrice: data.purchasePrice ?? 0,
          sellingPrice: data.sellingPrice ?? 0,
          qtyReceived: data.initialStock, qtyAvailable: data.initialStock,
        },
      });
      await tx.stockTransaction.create({
        data: {
          shopId, productId: product.id, batchId: batch.id,
          type: TransactionType.opening_stock,
          qty: data.initialStock, balanceAfter: data.initialStock,
          unitCost: data.purchasePrice ?? 0, referenceType: 'OpeningStock',
          operatorId: data.operatorId,
        },
      });
    }

    return tx.product.findUnique({ where: { id: product.id }, select: productSelect });
  });
}

// ── Update product ────────────────────────────────────────────────────────────
export async function updateProduct(shopId: number, productId: number, data: Record<string, any>) {
  const product = await prisma.product.findFirst({ where: { id: productId, shopId, deletedAt: null } });
  if (!product) throw new AppError('Product not found', 404);

  const { initialStock, purchasePrice, sellingPrice, ...rest } = data;
  return prisma.product.update({ where: { id: productId }, data: rest, select: productSelect });
}

// ── Soft-delete product ───────────────────────────────────────────────────────
export async function deleteProduct(shopId: number, productId: number) {
  const product = await prisma.product.findFirst({ where: { id: productId, shopId } });
  if (!product) throw new AppError('Product not found', 404);
  await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date(), isActive: false } });
}

// ── Get categories / brands / units ──────────────────────────────────────────
export async function getCategories(shopId: number) {
  return prisma.category.findMany({ where: { shopId, isActive: true }, orderBy: { name: 'asc' } });
}
export async function getBrands(shopId: number) {
  return prisma.brand.findMany({ where: { shopId, isActive: true }, orderBy: { name: 'asc' } });
}
export async function getUnits(shopId: number) {
  return prisma.unit.findMany({ where: { shopId, isActive: true }, orderBy: { name: 'asc' } });
}
export async function createCategory(shopId: number, name: string, parentId?: number) {
  return prisma.category.upsert({ where: { shopId_name: { shopId, name } }, update: {}, create: { shopId, name, parentId } });
}
