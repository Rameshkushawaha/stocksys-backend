import { prisma } from '../prisma';

/**
 * Generates the next invoice number for a shop atomically.
 * Format: {prefix}-{YYYY}-{counter padded to 5 digits}
 * e.g. INV-2026-00042
 */
export async function nextInvoiceNo(shopId: number): Promise<string> {
  const settings = await prisma.shopSettings.update({
    where: { shopId },
    data:  { invoiceCounter: { increment: 1 } },
    select: { invoicePrefix: true, invoiceCounter: true },
  });
  const year    = new Date().getFullYear();
  const counter = String(settings.invoiceCounter).padStart(5, '0');
  return `${settings.invoicePrefix}-${year}-${counter}`;
}
