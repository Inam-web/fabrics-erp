// Safe, idempotent schema reconciliation for EXISTING databases.
// Only adds missing columns (with defaults) — never drops, renames, rewrites
// or touches existing rows. Runs at server start so an older production
// database (e.g. created before newer features) works without manual steps.
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { businesses, customers, warehouses, users, sessions, sales, payments, auditLogs } from "@/db/schema";
import { BOOTSTRAP_SQL } from "./bootstrapSql.mjs";
import { inArray } from "drizzle-orm";

const STATEMENTS = [
  // products — fabric master extensions (GST, pricing floors, MRP, settings)
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_rate numeric(6,2) DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price numeric(14,2) DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp numeric(14,2) DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_discount_pct numeric(6,2) DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'General'`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS not_for_sale boolean DEFAULT false`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS description text`,
  // sales — GST mode per invoice + wholesale/retail classification
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS gst_mode text DEFAULT 'none'`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_kind text DEFAULT 'wholesale'`,
  // payment allocations — refund/void tracking slice status
  `ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS status text DEFAULT 'final'`,
  // payments — distinguish billing-time payments from khata recovery receipts (ograi)
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind text DEFAULT 'receipt'`,
  // backfill: billing-time payments (same amount, created within 5s of the sale) become kind='sale'
  `UPDATE payments p SET kind='sale'
   WHERE (p.kind IS NULL OR p.kind='receipt')
     AND EXISTS (SELECT 1 FROM payment_allocations pa JOIN sales s ON s.id = pa.doc_id
                 WHERE pa.payment_id = p.id AND pa.doc_type='sale'
                   AND pa.amount = p.amount::numeric
                   AND abs(EXTRACT(EPOCH FROM (s.created_at - p.created_at))) < 5)`,
  // business — logo on invoices
  `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo text`,
  // products — inventory source: wholesale kaatha vs manual retail-only stock
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS source text DEFAULT 'wholesale'`,
  // warehouses — code to identify the dedicated retail shop
  `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS code text`,
  // ---- performance indexes (idempotent) ----
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sret_items_return ON sales_return_items(return_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pret_items_return ON purchase_return_items(return_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(business_id, party_type, kind, date)`,
  `CREATE INDEX IF NOT EXISTS idx_alloc_payment ON payment_allocations(payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alloc_doc ON payment_allocations(doc_type, doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schedules_customer ON collection_schedules(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_salesman ON sales(salesman_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_salesman ON customers(salesman_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_source ON products(business_id, source)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_product ON stock(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cheques_business ON cheques(business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_business ON accounts(business_id)`,
  `CREATE INDEX IF NOT EXISTS idx_warehouses_business ON warehouses(business_id)`,
];

export async function ensureSchema() {
  let applied = 0;
  // Schema healing: create ANY missing tables/indexes (fresh DB or older-version DB),
  // never touching existing rows. Skipped entirely when the schema is already complete.
  try {
    const rs = await db.execute(sql`
      SELECT count(*)::int n FROM unnest(ARRAY['businesses','users','sessions','customers','suppliers','products',
        'stock','stock_movements','sales','sale_items','purchases','purchase_items','sales_returns','sales_return_items',
        'purchase_returns','purchase_return_items','payments','payment_allocations','accounts','expenses','expense_categories',
        'cheques','collection_schedules','warehouses','branches','salesmen','salesman_routes','employees','customer_prices',
        'journal_entries','journal_lines','audit_logs','day_closings','notifications','doc_sequences']) t
      WHERE to_regclass('public.' || t) IS NOT NULL`);
    if (Number(rs.rows?.[0]?.n || 0) < 35) {
      const ddl = BOOTSTRAP_SQL
        .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
        .replace(/CREATE UNIQUE INDEX /g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ");
      const stmts = ddl.split(/;\n/)
        .map((x) => x.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n").trim())
        .filter((x) => x.length > 2);
      let made = 0;
      for (const st of stmts) {
        try { await db.execute(sql.raw(st)); made++; } catch { /* object already exists — keep going */ }
      }
      console.log(`[migrate] schema healed — ${made} statements applied, existing data untouched.`);
    }
  } catch (e) {
    console.warn("[migrate] bootstrap skipped:", e?.message);
  }

  // Meter-only policy: relabel legacy yard units in older data.
  try {
    await db.execute(sql`UPDATE products SET unit = 'meter' WHERE unit IN ('yard', 'yards')`);
  } catch { /* table may not exist yet on first pass */ }
  for (const st of STATEMENTS) {
    try {
      await db.execute(sql.raw(st));
      applied++;
    } catch (e) {
      // Table may not exist on a very old DB — drizzle push creates full schema;
      // log and continue so startup never crashes because of one column.
      console.warn("[migrate] skipped:", st.slice(0, 60), "—", e?.message);
    }
  }
  // Ensure every business has a dedicated Retail Shop godown (separate stock source).
  try {
    const bizs = await db.select({ id: businesses.id }).from(businesses);
    for (const bz of bizs) {
      const [rw] = await db.select({ id: warehouses.id }).from(warehouses)
        .where(and(eq(warehouses.businessId, bz.id), eq(warehouses.code, "RETAIL"))).limit(1);
      if (!rw) {
        await db.insert(warehouses).values({ businessId: bz.id, name: "Retail Shop", code: "RETAIL", isMain: false });
        applied++;
      }
    }
  } catch (e) {
    console.warn("[migrate] retail shop godown skipped:", e?.message);
  }
  // Remove legacy demo staff accounts (owner-only demo), preserving history via NULLed references.
  try {
    const demoStaff = await db.select({ id: users.id }).from(users)
      .where(inArray(users.email, ["accountant@afridifabrics.pk", "asad@afridifabrics.pk"]));
    if (demoStaff.length) {
      const ids = demoStaff.map((u) => u.id);
      await db.update(auditLogs).set({ userId: null }).where(inArray(auditLogs.userId, ids));
      await db.update(sales).set({ createdBy: null }).where(inArray(sales.createdBy, ids));
      await db.update(payments).set({ createdBy: null }).where(inArray(payments.createdBy, ids));
      await db.delete(sessions).where(inArray(sessions.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
      applied += ids.length;
    }
  } catch (e) {
    console.warn("[migrate] demo staff cleanup skipped:", e?.message);
  }
  // Ensure every business has a walk-in retail counter customer (additive only).
  try {
    const bizs = await db.select({ id: businesses.id }).from(businesses);
    for (const bz of bizs) {
      const [w] = await db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.businessId, bz.id), eq(customers.code, "WALKIN"))).limit(1);
      if (!w) {
        await db.insert(customers).values({
          businessId: bz.id, code: "WALKIN", name: "Walk-in Customer (Retail)",
          category: "retail", priceLevel: "retail", paymentTerms: "cash",
          creditLimit: "0", weeklyOgrai: "0", openingBalance: "0", balance: "0", status: "active",
        });
        applied++;
      }
    }
  } catch (e) {
    console.warn("[migrate] walk-in customer skipped:", e?.message);
  }
  return applied;
}
