/**
 * GST Utilities
 * Handles inclusive/exclusive tax, CGST+SGST split, HSN-based rates
 */

export interface TaxBreakup {
  baseAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  grandTotal: number;
}

/**
 * Calculate tax for a line item
 * @param amount   - selling price (inclusive or exclusive based on taxIncluded)
 * @param taxPct   - GST % (e.g. 18)
 * @param cessPct  - Cess % (e.g. 0)
 * @param qty      - quantity
 * @param taxIncluded - true = price includes GST
 * @param isIgst   - true = inter-state (IGST), false = intra-state (CGST+SGST)
 */
export function calcLineTax(
  amount: number,
  taxPct: number,
  cessPct = 0,
  qty = 1,
  taxIncluded = false,
  isIgst = false
): TaxBreakup {
  const lineAmount = amount * qty;

  let baseAmount: number;
  let taxAmount: number;

  if (taxIncluded) {
    baseAmount = round2(lineAmount / (1 + (taxPct + cessPct) / 100));
    taxAmount  = round2(lineAmount - baseAmount);
  } else {
    baseAmount = lineAmount;
    taxAmount  = round2(lineAmount * (taxPct / 100));
  }

  const cessAmount = round2(baseAmount * (cessPct / 100));

  const cgst = isIgst ? 0 : round2(taxAmount / 2);
  const sgst = isIgst ? 0 : round2(taxAmount / 2);
  const igst = isIgst ? taxAmount : 0;

  return {
    baseAmount,
    cgst, sgst, igst,
    cess: cessAmount,
    totalTax: taxAmount + cessAmount,
    grandTotal: baseAmount + taxAmount + cessAmount,
  };
}

/**
 * Compute bill-level totals from line items
 */
export function calcBillTotals(lines: Array<{
  qty: number; rate: number; taxPercent: number; cessPercent?: number;
  discountPercent?: number; discountAmount?: number;
}>, taxIncluded = false) {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalCess = 0;

  const items = lines.map(l => {
    const grossLine = l.qty * l.rate;
    const discPct   = l.discountPercent ?? 0;
    const discAmt   = l.discountAmount ?? round2(grossLine * discPct / 100);
    const afterDisc = grossLine - discAmt;

    const tax = calcLineTax(afterDisc, l.taxPercent, l.cessPercent ?? 0, 1, taxIncluded);

    subtotal     += tax.baseAmount;
    totalDiscount+= discAmt;
    totalTax     += tax.totalTax - tax.cess;
    totalCess    += tax.cess;

    return {
      grossLine, discountAmount: discAmt, baseAmount: tax.baseAmount,
      taxAmount: tax.totalTax - tax.cess, cessAmount: tax.cess,
      lineTotal: tax.grandTotal,
    };
  });

  const roundOff = round2(Math.round(subtotal + totalTax + totalCess) - (subtotal + totalTax + totalCess));
  const grandTotal = round2(subtotal + totalTax + totalCess + roundOff);

  return { subtotal, totalDiscount, totalTax, totalCess, roundOff, grandTotal, items };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
