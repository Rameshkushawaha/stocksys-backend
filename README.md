# StockSys Backend — Multi-Shop Inventory & Billing API

A production-ready REST API built with **Express + Prisma + PostgreSQL**.  
Supports multi-shop SaaS, FIFO stock batches, GST billing, loyalty points, credits (udhaar), and full audit trails.

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env and configure
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET

# 3. Create DB schema
npx prisma migrate dev --name init

# 4. Seed with demo data
npm run db:seed

# 5. Start dev server
npm run dev
# → http://localhost:3000
```

---

## 🗄️ Database Schema Overview

```
TENANT
  Shops → ShopSettings

AUTH
  Users → Sessions
  (Roles: super_admin, admin, stock_adder, seller, accountant)

PRODUCTS
  Categories (hierarchical) → Brands → Units
  Products → StockBatches (FIFO) → StockTransactions (audit)

PURCHASES
  Suppliers → Purchases → PurchaseItems → PurchaseReturns
  (Creates StockBatch per purchase item)

SALES
  Customers → CustomerPoints → CustomerCredits → CreditPayments
  Sales → SaleItems (with batch reference for FIFO)
  SaleReturns → SaleReturnItems

SYSTEM
  Notifications → AuditLog
```

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | — | Login with role + PIN |
| POST | `/api/auth/logout` | Any | Logout, invalidate token |
| GET | `/api/auth/me` | Any | Current user info |
| GET | `/api/auth/users` | admin | List shop users |
| POST | `/api/auth/users` | admin | Create user |

**Login body:**
```json
{ "role": "seller", "pin": "3333", "shopId": 1 }
```
**Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": 3, "name": "Priya Sharma", "role": "seller", "shopId": 1 },
    "token": "eyJhbGci..."
  }
}
```

---

### Products
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/products` | Any | List all products (with current stock) |
| GET | `/api/products?search=xyz` | Any | Search by name/barcode/SKU |
| GET | `/api/products?lowStock=true` | Any | Only low-stock items |
| GET | `/api/products?categoryId=2` | Any | Filter by category |
| GET | `/api/products/barcode/:barcode` | Any | Lookup by barcode (scanner endpoint) |
| GET | `/api/products/categories` | Any | All categories |
| GET | `/api/products/brands` | Any | All brands |
| GET | `/api/products/units` | Any | All units |
| POST | `/api/products` | admin, stock_adder | Create product + opening stock |
| PUT | `/api/products/:id` | admin | Update product |
| DELETE | `/api/products/:id` | admin | Soft-delete product |

**Create product body:**
```json
{
  "barcode": "BC-NEW-001",
  "sku": "NEW-001",
  "name": "New Product",
  "categoryId": 1,
  "brandId": 1,
  "unitId": 1,
  "hsnCode": "8471",
  "taxPercent": 18,
  "minStock": 10,
  "initialStock": 50,
  "purchasePrice": 800,
  "sellingPrice": 1299
}
```

---

### Sales / Billing
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/sales/checkout` | admin, seller | Create sale (FIFO deduction + GST) |
| GET | `/api/sales` | Any | List sales (paginated) |
| GET | `/api/sales?from=2026-01-01&to=2026-04-20` | Any | Date range |
| GET | `/api/sales/:id` | Any | Single sale with items |
| POST | `/api/sales/:id/return` | admin, seller | Process sale return |

**Checkout body:**
```json
{
  "items": [
    { "barcodeId": "BC-001-ELC", "quantity": 1 },
    { "barcodeId": "BC-004-GRC", "quantity": 2 }
  ],
  "customerId": 1,
  "paymentMode": "UPI",
  "discountAmount": 50,
  "pointsToRedeem": 100,
  "notes": "Regular customer"
}
```

**FIFO logic:** Oldest batch is consumed first. If a product spans multiple batches, line items are split automatically across batches.

**Sale return body:**
```json
{
  "items": [{ "saleItemId": 5, "qty": 1 }],
  "reason": "Defective product",
  "refundMode": "Cash"
}
```

---

### Purchases
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/purchases` | admin, stock_adder | List purchases |
| POST | `/api/purchases` | admin, stock_adder | Create purchase + FIFO batch |
| GET | `/api/purchases/suppliers` | admin, stock_adder | List suppliers |
| POST | `/api/purchases/suppliers` | admin, stock_adder | Create supplier |
| POST | `/api/purchases/adjust` | admin, stock_adder | Manual stock adjustment |

**Purchase body:**
```json
{
  "supplierId": 1,
  "invoiceNo": "SUP-INV-100",
  "paymentMode": "Card",
  "purchasedAt": "2026-04-20",
  "items": [
    {
      "productId": 1,
      "qty": 20,
      "purchasePrice": 3500,
      "sellingPrice": 4999,
      "mrp": 5500,
      "taxPercent": 18,
      "expiryDate": "2027-12-31",
      "batchNo": "BATCH-2026-04"
    }
  ]
}
```

**Stock adjustment body:**
```json
{
  "productId": 1,
  "qty": -5,
  "type": "adjustment_out",
  "note": "Damaged during storage"
}
```
Types: `adjustment_in`, `adjustment_out`, `opening_stock`

---

### Customers
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/customers` | Any | List customers |
| GET | `/api/customers?search=Rajesh` | Any | Search by name/mobile |
| POST | `/api/customers` | Any | Create customer |
| PUT | `/api/customers/:id` | Any | Update customer |
| GET | `/api/customers/:id` | Any | Customer detail + sales + credits |
| GET | `/api/customers/:id/points` | Any | Loyalty points history |
| GET | `/api/customers/:id/credits` | Any | Pending credits (udhaar) |
| GET | `/api/customers/credits/all` | admin | All pending credits |
| POST | `/api/customers/credits/:id/pay` | Any | Record credit payment |

**Credit payment body:**
```json
{ "amount": 1500, "paymentMode": "Cash", "note": "Partial payment" }
```

---

### Reports
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/dashboard` | admin, seller, accountant | Full stats |
| GET | `/api/reports/demand?days=30` | admin, seller | Sales velocity ranking |
| GET | `/api/reports/gst?from=2026-04-01&to=2026-04-30` | admin, accountant | GST breakup by HSN |
| GET | `/api/reports/stock-ledger/:productId` | admin | Full stock audit trail |
| GET | `/api/reports/expiry?days=30` | admin | Batches expiring soon |
| GET | `/api/reports/top-customers?limit=10` | admin, seller | Top customers by spend |

---

### Notifications
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | Any | All notifications |
| GET | `/api/notifications?unread=true` | Any | Unread only |
| POST | `/api/notifications/read` | Any | Mark as read `{ "ids": [1,2,3] }` |
| POST | `/api/notifications/check` | admin | Run low-stock + expiry checks |

---

## 🏗️ Architecture

```
src/
├── server.ts          # Entry point — starts HTTP server
├── app.ts             # Express setup, middleware, route mounting
├── prisma.ts          # Prisma client singleton
├── types/index.ts     # Shared types, JwtPayload, ApiResponse
│
├── middleware/
│   ├── auth.middleware.ts    # requireAuth, requireRole, requireShopAccess
│   └── error.middleware.ts   # asyncHandler, errorHandler, AppError
│
├── routes/            # Thin layer — validate input, call service, return response
│   ├── auth.routes.ts
│   ├── product.routes.ts
│   ├── sales.routes.ts
│   ├── purchase.routes.ts
│   ├── customer.routes.ts
│   ├── report.routes.ts
│   └── notification.routes.ts
│
├── services/          # All business logic lives here
│   ├── auth.service.ts        # Login, JWT, PIN hash
│   ├── product.service.ts     # CRUD, barcode lookup
│   ├── sales.service.ts       # Checkout, returns, FIFO consumption
│   ├── purchase.service.ts    # Purchase, FIFO batch creation, adjustments
│   ├── customer.service.ts    # Loyalty, credits (udhaar)
│   ├── report.service.ts      # Dashboard, demand, GST, ledger
│   └── notification.service.ts
│
└── utils/
    ├── fifo.ts        # FIFO batch allocation + commit logic
    ├── gst.ts         # GST / tax calculation utilities
    └── invoice.ts     # Auto-increment invoice number generator

prisma/
├── schema.prisma      # Full DB schema (16 models)
└── seed.ts            # Demo data seeder
```

---

## 🔑 FIFO Implementation

Every purchase creates a `StockBatch` with `purchasePrice`, `sellingPrice`, and `qtyAvailable`.

At checkout, `allocateFifo()`:
1. Fetches all batches for the product ordered by `createdAt ASC` (oldest first)
2. Allocates qty from each batch in order
3. Returns an allocation map `[{ batchId, qty, unitPrice }]`
4. `commitFifo()` decrements each batch inside the DB transaction

This means the sale item always knows **exactly** which batch it consumed, enabling:
- Accurate cost-of-goods-sold
- Correct expiry tracking  
- Full stock audit trail

---

## 📊 Sample DB Credentials (after seed)

| Role | Email | PIN |
|------|-------|-----|
| Admin | admin@stocksys.local | 1234 |
| Stock Adder | ravi@stocksys.local | 2222 |
| Seller / Cashier | priya@stocksys.local | 3333 |
| Accountant | meena@stocksys.local | 4444 |

---

## 🚀 Deployment

```bash
# Build TypeScript
npm run build

# Set production env
NODE_ENV=production
DATABASE_URL=...
JWT_SECRET=<strong-random-secret>

# Run migrations
npx prisma migrate deploy

# Start
npm start
```

Recommended: Deploy behind **Nginx** reverse proxy on port 80/443.  
Use **PM2** for process management: `pm2 start dist/server.js --name stocksys-api`
