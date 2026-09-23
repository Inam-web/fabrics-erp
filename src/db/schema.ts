import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const qtyCol = (name: string) => numeric(name, { precision: 14, scale: 2 }).default("0");

// ---------- Platform / tenancy ----------
export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  currency: text("currency").default("PKR").notNull(),
  taxPct: numeric("tax_pct", { precision: 6, scale: 2 }).default("0"),
  invoiceFooter: text("invoice_footer"),
  logo: text("logo"), // base64 data URL shown on invoices & reports
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").default("salesman").notNull(), // owner | manager | accountant | salesman | cashier | warehouse
    phone: text("phone"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
});

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  address: text("address"),
});

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  branchId: integer("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  code: text("code"), // RETAIL = dedicated retail-shop stock, kept separate from wholesale godowns
  isMain: boolean("is_main").default(false),
});

// ---------- People ----------
export const salesmen = pgTable("salesmen", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone"),
  commissionType: text("commission_type").default("none").notNull(), // none | percent_sales | percent_collection
  commissionRate: numeric("commission_rate", { precision: 6, scale: 2 }).default("0"),
  active: boolean("active").default(true),
});

export const salesmanRoutes = pgTable("salesman_routes", {
  id: serial("id").primaryKey(),
  salesmanId: integer("salesman_id").notNull().references(() => salesmen.id),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun .. 6=Sat
  areas: text("areas").notNull(), // comma separated
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ownerName: text("owner_name"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    address: text("address"),
    city: text("city"),
    area: text("area"),
    cnic: text("cnic"),
    category: text("category").default("wholesale").notNull(), // wholesale | retail | vip | regular | new | cash
    priceLevel: text("price_level").default("wholesale").notNull(), // wholesale | retail | vip
    discountPct: numeric("discount_pct", { precision: 6, scale: 2 }).default("0"),
    creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }).default("0"),
    paymentTerms: text("payment_terms").default("weekly").notNull(), // daily | weekly | biweekly | monthly | custom
    weeklyOgrai: numeric("weekly_ograi", { precision: 14, scale: 2 }).default("0"),
    salesmanId: integer("salesman_id").references(() => salesmen.id),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).default("0"),
    balance: numeric("balance", { precision: 14, scale: 2 }).default("0"), // receivable (debit balance)
    status: text("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("customers_business_idx").on(t.businessId),
    index("customers_name_idx").on(t.name),
    index("customers_phone_idx").on(t.phone),
  ]
);

export const customerPrices = pgTable(
  "customer_prices",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    productId: integer("product_id").notNull().references(() => products.id),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("customer_prices_uq").on(t.customerId, t.productId)]
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    category: text("category").default("mill").notNull(), // mill | wholesaler | importer | agent
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).default("0"),
    balance: numeric("balance", { precision: 14, scale: 2 }).default("0"), // payable (credit balance)
    paymentTerms: text("payment_terms").default("monthly").notNull(),
    status: text("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("suppliers_business_idx").on(t.businessId)]
);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
  phone: text("phone"),
  role: text("role"),
  salary: numeric("salary", { precision: 14, scale: 2 }).default("0"),
  joiningDate: date("joining_date"),
  status: text("status").default("active"),
});

// ---------- Catalog / inventory ----------
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(), // fabric type e.g. Wash & Wear
    fabricType: text("fabric_type"),
    design: text("design"),
    color: text("color"),
    brand: text("brand"), // mill
    collection: text("collection"),
    season: text("season"),
    quality: text("quality"),
    widthIn: numeric("width_in", { precision: 6, scale: 2 }),
    unit: text("unit").default("meter").notNull(), // meter | piece | set | kg
    source: text("source").default("wholesale").notNull(), // wholesale | retail (manual retail-only product)
    costPrice: numeric("cost_price", { precision: 14, scale: 2 }).default("0"),
    wholesalePrice: numeric("wholesale_price", { precision: 14, scale: 2 }).default("0"),
    retailPrice: numeric("retail_price", { precision: 14, scale: 2 }).default("0"),
    vipPrice: numeric("vip_price", { precision: 14, scale: 2 }).default("0"),
    reorderLevel: numeric("reorder_level", { precision: 12, scale: 2 }).default("0"),
    gstRate: numeric("gst_rate", { precision: 6, scale: 2 }).default("0"),
    hsn: text("hsn"), // HSN / SAC code
    minPrice: numeric("min_price", { precision: 14, scale: 2 }).default("0"), // enforced floor unless overridden
    mrp: numeric("mrp", { precision: 14, scale: 2 }).default("0"),
    saleDiscountPct: numeric("sale_discount_pct", { precision: 6, scale: 2 }).default("0"), // auto discount at billing
    productType: text("product_type").default("General"),
    notForSale: boolean("not_for_sale").default(false),
    description: text("description"),
    active: boolean("active").default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("products_business_idx").on(t.businessId),
    index("products_name_idx").on(t.name),
    index("products_barcode_idx").on(t.barcode),
  ]
);

export const stock = pgTable(
  "stock",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    productId: integer("product_id").notNull().references(() => products.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    qty: qtyCol("qty"),
    avgCost: numeric("avg_cost", { precision: 14, scale: 2 }).default("0"),
  },
  (t) => [uniqueIndex("stock_uq").on(t.productId, t.warehouseId), index("stock_business_idx").on(t.businessId)]
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    productId: integer("product_id").notNull().references(() => products.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    type: text("type").notNull(), // purchase | sale | sale_return | purchase_return | adjust_in | adjust_out | damage | transfer_in | transfer_out | opening
    qty: qtyCol("qty"), // signed
    prevQty: qtyCol("prev_qty"),
    newQty: qtyCol("new_qty"),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    refNo: text("ref_no"),
    reason: text("reason"),
    userId: integer("user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("movements_business_idx").on(t.businessId), index("movements_product_idx").on(t.productId)]
);

// ---------- Document numbering ----------
export const docSequences = pgTable(
  "doc_sequences",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    key: text("key").notNull(), // INV, PUR, REC, SPAY, RET, PRET, TRF, ADJ
    prefix: text("prefix").notNull(),
    lastNumber: integer("last_number").default(0).notNull(),
  },
  (t) => [uniqueIndex("doc_sequences_uq").on(t.businessId, t.key)]
);

// ---------- Sales ----------
export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    invoiceNo: text("invoice_no").notNull(),
    date: date("date").notNull(),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    salesmanId: integer("salesman_id").references(() => salesmen.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).default("0"),
    discount: numeric("discount", { precision: 14, scale: 2 }).default("0"),
    tax: numeric("tax", { precision: 14, scale: 2 }).default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).default("0"),
    paid: numeric("paid", { precision: 14, scale: 2 }).default("0"),
    balance: numeric("balance", { precision: 14, scale: 2 }).default("0"), // outstanding on this invoice
    prevBalance: numeric("prev_balance", { precision: 14, scale: 2 }).default("0"),
    status: text("status").default("final").notNull(), // final | void
    gstMode: text("gst_mode").default("none"), // none | intra (CGST+SGST) | inter (IGST)
    saleKind: text("sale_kind").default("wholesale"), // wholesale | retail
    voidReason: text("void_reason"),
    isBackdated: boolean("is_backdated").default(false),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("sales_business_idx").on(t.businessId),
    index("sales_customer_idx").on(t.customerId),
    index("sales_date_idx").on(t.date),
    uniqueIndex("sales_invoice_uq").on(t.businessId, t.invoiceNo),
  ]
);

export const saleItems = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => sales.id),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qtyCol("qty"),
  rate: numeric("rate", { precision: 14, scale: 2 }).default("0"),
  discount: numeric("discount", { precision: 14, scale: 2 }).default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).default("0"),
  costRate: numeric("cost_rate", { precision: 14, scale: 2 }).default("0"),
});

export const salesReturns = pgTable(
  "sales_returns",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    returnNo: text("return_no").notNull(),
    date: date("date").notNull(),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    saleId: integer("sale_id").references(() => sales.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    total: numeric("total", { precision: 14, scale: 2 }).default("0"),
    status: text("status").default("final").notNull(),
    reason: text("reason"),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("sret_business_idx").on(t.businessId), index("sret_customer_idx").on(t.customerId)]
);

export const salesReturnItems = pgTable("sales_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => salesReturns.id),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qtyCol("qty"),
  rate: numeric("rate", { precision: 14, scale: 2 }).default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).default("0"),
  costRate: numeric("cost_rate", { precision: 14, scale: 2 }).default("0"),
});

// ---------- Purchases ----------
export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    purchaseNo: text("purchase_no").notNull(),
    refNo: text("ref_no"), // supplier's invoice number
    date: date("date").notNull(),
    supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).default("0"),
    discount: numeric("discount", { precision: 14, scale: 2 }).default("0"),
    extraCost: numeric("extra_cost", { precision: 14, scale: 2 }).default("0"), // delivery/transport/landing charges
    total: numeric("total", { precision: 14, scale: 2 }).default("0"),
    paid: numeric("paid", { precision: 14, scale: 2 }).default("0"),
    balance: numeric("balance", { precision: 14, scale: 2 }).default("0"),
    status: text("status").default("final").notNull(),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("purchases_business_idx").on(t.businessId),
    index("purchases_supplier_idx").on(t.supplierId),
    uniqueIndex("purchases_no_uq").on(t.businessId, t.purchaseNo),
  ]
);

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qtyCol("qty"),
  rate: numeric("rate", { precision: 14, scale: 2 }).default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).default("0"),
});

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    returnNo: text("return_no").notNull(),
    date: date("date").notNull(),
    supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
    purchaseId: integer("purchase_id").references(() => purchases.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    total: numeric("total", { precision: 14, scale: 2 }).default("0"),
    status: text("status").default("final").notNull(),
    reason: text("reason"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("pret_business_idx").on(t.businessId)]
);

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => purchaseReturns.id),
  productId: integer("product_id").notNull().references(() => products.id),
  qty: qtyCol("qty"),
  rate: numeric("rate", { precision: 14, scale: 2 }).default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).default("0"),
});

// ---------- Money ----------
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  type: text("type").default("cash").notNull(), // cash | bank
  name: text("name").notNull(),
  bankName: text("bank_name"),
  accountNo: text("account_no"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).default("0"),
  balance: numeric("balance", { precision: 14, scale: 2 }).default("0"),
  active: boolean("active").default(true),
});

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    receiptNo: text("receipt_no").notNull(),
    date: date("date").notNull(),
    partyType: text("party_type").notNull(), // customer | supplier
    partyId: integer("party_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: text("method").default("cash").notNull(), // cash | bank_transfer | cheque | online | easypaisa | jazzcash | other
    accountId: integer("account_id").notNull().references(() => accounts.id),
    chequeId: integer("cheque_id"),
    scheduleId: integer("schedule_id").references(() => collectionSchedules.id),
    salesmanId: integer("salesman_id").references(() => salesmen.id),
    kind: text("kind").default("receipt").notNull(), // receipt = khata recovery (ograi) | sale = taken at billing time
    refNo: text("ref_no"),
    notes: text("notes"),
    status: text("status").default("final").notNull(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("payments_business_idx").on(t.businessId),
    index("payments_party_idx").on(t.partyType, t.partyId),
    index("payments_date_idx").on(t.date),
    uniqueIndex("payments_no_uq").on(t.businessId, t.receiptNo),
  ]
);

export const paymentAllocations = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => payments.id),
  docType: text("doc_type").notNull(), // sale | purchase
  docId: integer("doc_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").default("final").notNull(), // final | void (void = refunded when its invoice was voided)
});

export const cheques = pgTable("cheques", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  direction: text("direction").notNull(), // in | out
  partyType: text("party_type").notNull(),
  partyId: integer("party_id").notNull(),
  bank: text("bank"),
  chequeNo: text("cheque_no"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  issueDate: date("issue_date"),
  expectedDate: date("expected_date"),
  status: text("status").default("pending").notNull(), // pending | deposited | cleared | bounced | cancelled
  paymentId: integer("payment_id").references(() => payments.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    categoryId: integer("category_id").notNull().references(() => expenseCategories.id),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    accountId: integer("account_id").notNull().references(() => accounts.id),
    description: text("description"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("expenses_business_idx").on(t.businessId), index("expenses_date_idx").on(t.date)]
);

export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull(),
});

// ---------- Ograi / collections ----------
export const collectionSchedules = pgTable(
  "collection_schedules",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    weekStart: date("week_start").notNull(), // Monday
    dueDate: date("due_date").notNull(),
    expected: numeric("expected", { precision: 14, scale: 2 }).notNull(),
    collected: numeric("collected", { precision: 14, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("schedules_uq").on(t.customerId, t.weekStart),
    index("schedules_business_idx").on(t.businessId),
    index("schedules_week_idx").on(t.weekStart),
  ]
);

// ---------- Accounting ----------
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  date: date("date").notNull(),
  refType: text("ref_type").notNull(),
  refId: integer("ref_id").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => journalEntries.id),
  accountCode: text("account_code").notNull(), // CASH | BANK | AR | AP | SALES | SALES_RET | PURCHASES | COGS | INVENTORY | EXPENSE | CAPITAL | OPENING
  entityId: integer("entity_id"),
  debit: numeric("debit", { precision: 14, scale: 2 }).default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).default("0"),
});

// ---------- Audit / notifications / closing ----------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    userId: integer("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    oldValues: text("old_values"),
    newValues: text("new_values"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("audit_business_idx").on(t.businessId)]
);

export const dayClosings = pgTable(
  "day_closings",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    openingCash: numeric("opening_cash", { precision: 14, scale: 2 }).default("0"),
    cashIn: numeric("cash_in", { precision: 14, scale: 2 }).default("0"),
    cashOut: numeric("cash_out", { precision: 14, scale: 2 }).default("0"),
    expectedCash: numeric("expected_cash", { precision: 14, scale: 2 }).default("0"),
    actualCash: numeric("actual_cash", { precision: 14, scale: 2 }).default("0"),
    difference: numeric("difference", { precision: 14, scale: 2 }).default("0"),
    notes: text("notes"),
    closedBy: integer("closed_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("day_closings_uq").on(t.businessId, t.date)]
);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
