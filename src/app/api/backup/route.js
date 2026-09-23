import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { api } from "@/server/api.mjs";

// Full business data backup: one JSON file containing every table for this business.
export const GET = api(async ({ user }) => {
  const b = user.businessId;
  const dump = {
    exportedAt: new Date().toISOString(),
    format: "faberp-backup/1",
    businesses: await db.select().from(s.businesses).where(eq(s.businesses.id, b)),
    users: (await db.select().from(s.users).where(eq(s.users.businessId, b))).map((u) => ({ ...u, passwordHash: "[redacted]" })),
    branches: await db.select().from(s.branches).where(eq(s.branches.businessId, b)),
    warehouses: await db.select().from(s.warehouses).where(eq(s.warehouses.businessId, b)),
    salesmen: await db.select().from(s.salesmen).where(eq(s.salesmen.businessId, b)),
    customers: await db.select().from(s.customers).where(eq(s.customers.businessId, b)),
    suppliers: await db.select().from(s.suppliers).where(eq(s.suppliers.businessId, b)),
    products: await db.select().from(s.products).where(eq(s.products.businessId, b)),
    stock: await db.select().from(s.stock).where(eq(s.stock.businessId, b)),
    stock_movements: await db.select().from(s.stockMovements).where(eq(s.stockMovements.businessId, b)),
    sales: await db.select().from(s.sales).where(eq(s.sales.businessId, b)),
    sale_items: await db.select().from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId)).where(eq(s.sales.businessId, b)),
    purchases: await db.select().from(s.purchases).where(eq(s.purchases.businessId, b)),
    purchase_items: await db.select().from(s.purchaseItems).innerJoin(s.purchases, eq(s.purchases.id, s.purchaseItems.purchaseId)).where(eq(s.purchases.businessId, b)),
    payments: await db.select().from(s.payments).where(eq(s.payments.businessId, b)),
    expenses: await db.select().from(s.expenses).where(eq(s.expenses.businessId, b)),
    accounts: await db.select().from(s.accounts).where(eq(s.accounts.businessId, b)),
    cheques: await db.select().from(s.cheques).where(eq(s.cheques.businessId, b)),
    collection_schedules: await db.select().from(s.collectionSchedules).where(eq(s.collectionSchedules.businessId, b)),
    journal_entries: await db.select().from(s.journalEntries).where(eq(s.journalEntries.businessId, b)),
    audit_logs: await db.select().from(s.auditLogs).where(eq(s.auditLogs.businessId, b)),
  };
  return new Response(JSON.stringify(dump), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="faberp-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
