import {
  PrismaClient,
  UserRole,
  TransactionType,
  PaymentMode,
  SaleStatus,
  TaxType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT = 10;

async function main() {
  console.log('🌱  Seeding StockSys…\n');

  // ── Shop ──────────────────────────────────────────────────────────────────
  const shop = await prisma.shop.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'StockSys Demo Store',
      ownerName: 'Arjun Mehta',
      mobile: '9876543210',
      email: 'store@stocksys.local',
      address: '12 MG Road',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      pincode: '208001',
      gstNo: '09AABCS1429B1ZB',
      settings: {
        create: {
          lowStockThreshold: 10,
          enableLoyalty: true,
          pointsPerRupee: 1,
          pointsRedeemRatio: 0.25,
          invoicePrefix: 'INV',
          invoiceCounter: 1,
        },
      },
    },
  });
  console.log(`✓ Shop: ${shop.name}`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const userDefs = [
    { name: 'Admin User',   email: 'admin@stocksys.local',  pin: '1234', role: UserRole.admin       },
    { name: 'Ravi Kumar',   email: 'ravi@stocksys.local',   pin: '2222', role: UserRole.stock_adder  },
    { name: 'Priya Sharma', email: 'priya@stocksys.local',  pin: '3333', role: UserRole.seller       },
    { name: 'Meena Joshi',  email: 'meena@stocksys.local',  pin: '4444', role: UserRole.accountant   },
  ];

  const userMap: Record<string, number> = {};
  for (const u of userDefs) {
    const pinHash = await bcrypt.hash(u.pin, SALT);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { shopId: shop.id, name: u.name, email: u.email, pinHash, role: u.role, avatar: u.name[0] },
    });
    userMap[u.name] = user.id;
    console.log(`✓ User: ${u.name} (${u.role}) PIN:${u.pin}`);
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const catNames = ['Electronics', 'Groceries', 'Stationery', 'Cleaning', 'Beverages', 'Dairy', 'Snacks'];
  const catMap: Record<string, number> = {};
  for (const name of catNames) {
    const c = await prisma.category.upsert({ where: { shopId_name: { shopId: shop.id, name } }, update: {}, create: { shopId: shop.id, name } });
    catMap[name] = c.id;
  }
  console.log(`✓ Categories: ${catNames.length}`);

  // ── Brands ───────────────────────────────────────────────────────────────
  const brandNames = ['Generic', 'Samsung', 'Amul', 'Parle', 'Fevicol', 'Dettol', 'Nestle'];
  const brandMap: Record<string, number> = {};
  for (const name of brandNames) {
    const b = await prisma.brand.upsert({ where: { shopId_name: { shopId: shop.id, name } }, update: {}, create: { shopId: shop.id, name } });
    brandMap[name] = b.id;
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  const units = [
    { name: 'Piece', abbreviation: 'Pcs' },
    { name: 'Kilogram', abbreviation: 'Kg' },
    { name: 'Litre', abbreviation: 'Ltr' },
    { name: 'Pack', abbreviation: 'Pk' },
  ];
  const unitMap: Record<string, number> = {};
  for (const u of units) {
    const unit = await prisma.unit.upsert({ where: { shopId_name: { shopId: shop.id, name: u.name } }, update: {}, create: { shopId: shop.id, ...u } });
    unitMap[u.name] = unit.id;
  }
  console.log(`✓ Units: ${units.length}`);

  // ── Supplier ──────────────────────────────────────────────────────────────
  const supplier = await prisma.supplier.create({
    data: { shopId: shop.id, name: 'Global Traders', mobile: '9000000001', email: 'global@traders.com', gstNo: '09TRADER1234A1Z1' },
  });

  // ── Products ─────────────────────────────────────────────────────────────
  const productDefs = [
    { barcode: 'BC-001-ELC', sku: 'ELC-001', name: 'Wireless Headphones Pro',     cat: 'Electronics', brand: 'Samsung',  unit: 'Piece',    hsn: '8518', tax: 18, price: 4999, cost: 3500, qty: 45 },
    { barcode: 'BC-002-ELC', sku: 'ELC-002', name: 'USB-C Hub 7-Port',            cat: 'Electronics', brand: 'Generic',  unit: 'Piece',    hsn: '8536', tax: 18, price: 1299, cost:  900, qty:  7 },
    { barcode: 'BC-003-ELC', sku: 'ELC-003', name: 'Mechanical Keyboard TKL',     cat: 'Electronics', brand: 'Generic',  unit: 'Piece',    hsn: '8471', tax: 18, price: 3499, cost: 2400, qty: 23 },
    { barcode: 'BC-004-GRC', sku: 'GRC-001', name: 'Organic Green Tea 200g',      cat: 'Groceries',   brand: 'Nestle',   unit: 'Pack',     hsn: '0902', tax:  5, price:  349, cost:  220, qty:  3 },
    { barcode: 'BC-005-GRC', sku: 'GRC-002', name: 'Almond Butter 500g',          cat: 'Groceries',   brand: 'Generic',  unit: 'Pack',     hsn: '2008', tax:  5, price:  599, cost:  400, qty: 18 },
    { barcode: 'BC-006-STN', sku: 'STN-001', name: 'A4 Notebook 200pg',           cat: 'Stationery',  brand: 'Generic',  unit: 'Piece',    hsn: '4820', tax: 12, price:  199, cost:  120, qty:  9 },
    { barcode: 'BC-007-STN', sku: 'STN-002', name: 'Premium Ballpen Set 12pc',    cat: 'Stationery',  brand: 'Fevicol',  unit: 'Pack',     hsn: '9608', tax: 12, price:  299, cost:  180, qty: 62 },
    { barcode: 'BC-008-ELC', sku: 'ELC-004', name: 'LED Desk Lamp',               cat: 'Electronics', brand: 'Generic',  unit: 'Piece',    hsn: '9405', tax: 18, price:  899, cost:  600, qty: 14 },
    { barcode: 'BC-009-GRC', sku: 'GRC-003', name: 'Mixed Nuts 300g',             cat: 'Snacks',      brand: 'Generic',  unit: 'Pack',     hsn: '2008', tax:  5, price:  449, cost:  300, qty:  5 },
    { barcode: 'BC-010-CLN', sku: 'CLN-001', name: 'Hand Sanitizer 500ml',        cat: 'Cleaning',    brand: 'Dettol',   unit: 'Piece',    hsn: '3808', tax: 18, price:  149, cost:   90, qty:  2 },
    { barcode: 'BC-011-CLN', sku: 'CLN-002', name: 'Surface Disinfectant 1L',     cat: 'Cleaning',    brand: 'Dettol',   unit: 'Litre',    hsn: '3808', tax: 18, price:  259, cost:  160, qty: 31 },
    { barcode: 'BC-012-ELC', sku: 'ELC-005', name: 'Portable Power Bank 20000mAh',cat: 'Electronics', brand: 'Generic',  unit: 'Piece',    hsn: '8507', tax: 18, price: 1999, cost: 1400, qty:  8 },
  ];

  const productMap: Record<string, number> = {};
  const batchMap: Record<string, number> = {};

  for (const p of productDefs) {
    const product = await prisma.product.create({
      data: {
        shopId: shop.id, categoryId: catMap[p.cat], brandId: brandMap[p.brand],
        unitId: unitMap[p.unit], barcode: p.barcode, sku: p.sku, name: p.name,
        hsnCode: p.hsn, taxPercent: p.tax, taxType: TaxType.GST,
        minStock: 10, expiryTracked: false,
      },
    });
    productMap[p.barcode] = product.id;

    // Opening batch
    const batch = await prisma.stockBatch.create({
      data: {
        shopId: shop.id, productId: product.id,
        purchasePrice: p.cost, sellingPrice: p.price, mrp: p.price,
        qtyReceived: p.qty, qtyAvailable: p.qty,
      },
    });
    batchMap[p.barcode] = batch.id;

    // Opening stock transaction
    await prisma.stockTransaction.create({
      data: {
        shopId: shop.id, productId: product.id, batchId: batch.id,
        type: TransactionType.opening_stock, qty: p.qty, balanceAfter: p.qty,
        unitCost: p.cost, referenceType: 'OpeningStock', operatorId: userMap['Admin User'],
      },
    });
  }
  console.log(`✓ Products: ${productDefs.length} with batches`);

  // ── Customers ─────────────────────────────────────────────────────────────
  const custDefs = [
    { name: 'Rajesh Gupta',  mobile: '9111111111', email: 'rajesh@example.com' },
    { name: 'Sunita Verma',  mobile: '9222222222', email: 'sunita@example.com' },
    { name: 'Amit Singh',    mobile: '9333333333', email: null },
  ];
  const custMap: Record<string, number> = {};
  for (const c of custDefs) {
    const cust = await prisma.customer.create({ data: { shopId: shop.id, ...c } });
    custMap[c.name] = cust.id;
  }
  console.log(`✓ Customers: ${custDefs.length}`);

  // ── Sample Purchase ───────────────────────────────────────────────────────
  const purchase = await prisma.purchase.create({
    data: {
      shopId: shop.id, supplierId: supplier.id, invoiceNo: 'SUP-INV-001',
      totalAmount: 50000, taxAmount: 7200, grandTotal: 57200,
      paymentMode: PaymentMode.Card, operatorId: userMap['Ravi Kumar'],
      purchasedAt: new Date(Date.now() - 10 * 86_400_000),
      items: {
        create: [
          { productId: productMap['BC-001-ELC'], qty: 10, purchasePrice: 3500, sellingPrice: 4999, mrp: 4999, taxPercent: 18, taxAmount: 630, lineTotal: 35000 },
          { productId: productMap['BC-003-ELC'], qty: 5,  purchasePrice: 2400, sellingPrice: 3499, mrp: 3499, taxPercent: 18, taxAmount: 432, lineTotal: 12000 },
        ],
      },
    },
  });
  console.log(`✓ Purchase: ${purchase.invoiceNo}`);

  // ── Sample Sales ──────────────────────────────────────────────────────────
  const saleData = [
    {
      invoiceNo: 'INV-0001', customerId: custMap['Rajesh Gupta'],
      items: [
        { barcode: 'BC-001-ELC', qty: 1 },
        { barcode: 'BC-004-GRC', qty: 2 },
      ],
      daysAgo: 5, mode: PaymentMode.UPI,
    },
    {
      invoiceNo: 'INV-0002', customerId: custMap['Sunita Verma'],
      items: [{ barcode: 'BC-007-STN', qty: 3 }, { barcode: 'BC-010-CLN', qty: 1 }],
      daysAgo: 3, mode: PaymentMode.Cash,
    },
    {
      invoiceNo: 'INV-0003', customerId: null,
      items: [{ barcode: 'BC-003-ELC', qty: 1 }],
      daysAgo: 1, mode: PaymentMode.Card,
    },
  ];

  for (const s of saleData) {
    let subtotal = 0;
    let taxTotal = 0;
    const lineItems: any[] = [];

    for (const si of s.items) {
      const pDef = productDefs.find(p => p.barcode === si.barcode)!;
      const lineBase = pDef.price * si.qty;
      const taxAmt = Math.round(lineBase * (pDef.tax / 118) * 100) / 100;
      subtotal += lineBase;
      taxTotal += taxAmt;
      lineItems.push({
        productId: productMap[si.barcode],
        batchId: batchMap[si.barcode],
        productName: pDef.name,
        barcodeSnapshot: si.barcode,
        qty: si.qty,
        rate: pDef.price,
        mrp: pDef.price,
        taxPercent: pDef.tax,
        taxAmount: taxAmt,
        lineTotal: lineBase,
      });

      // Deduct batch
      await prisma.stockBatch.update({
        where: { id: batchMap[si.barcode] },
        data: { qtyAvailable: { decrement: si.qty } },
      });

      // Stock transaction
      const bal = productDefs.find(p => p.barcode === si.barcode)!.qty - si.qty;
      await prisma.stockTransaction.create({
        data: {
          shopId: shop.id, productId: productMap[si.barcode], batchId: batchMap[si.barcode],
          type: TransactionType.sale, qty: -si.qty, balanceAfter: bal,
          unitCost: pDef.cost, referenceType: 'Sale', operatorId: userMap['Priya Sharma'],
        },
      });
    }

    const roundOff = Math.round((Math.round(subtotal) - subtotal) * 100) / 100;
    const grand = subtotal + roundOff;

    await prisma.sale.create({
      data: {
        shopId: shop.id, invoiceNo: s.invoiceNo, customerId: s.customerId,
        operatorId: userMap['Priya Sharma'],
        subtotal, taxAmount: taxTotal, roundOff, grandTotal: grand,
        amountPaid: grand, paymentMode: s.mode, status: SaleStatus.completed,
        saleDate: new Date(Date.now() - s.daysAgo * 86_400_000),
        items: { create: lineItems },
      },
    });
    console.log(`✓ Sale: ${s.invoiceNo}`);
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const lowStockProducts = productDefs.filter(p => p.qty < 10);
  for (const p of lowStockProducts) {
    await prisma.notification.create({
      data: {
        shopId: shop.id,
        type: 'low_stock',
        title: 'Low Stock Alert',
        message: `${p.name} has only ${p.qty} units remaining (threshold: 10)`,
        referenceId: productMap[p.barcode],
        referenceType: 'Product',
      },
    });
  }
  console.log(`✓ Notifications: ${lowStockProducts.length} low-stock alerts`);

  console.log('\n✅  Seed complete!\n');
  console.log('Credentials:');
  console.log('  admin@stocksys.local     PIN: 1234  (admin)');
  console.log('  ravi@stocksys.local      PIN: 2222  (stock_adder)');
  console.log('  priya@stocksys.local     PIN: 3333  (seller)');
  console.log('  meena@stocksys.local     PIN: 4444  (accountant)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
