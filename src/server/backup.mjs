// Business data backup — one JSON dump per business (every table, scoped by
// businessId). Shared by two paths:
//   1. Settings → "Download full backup" (GET /api/backup) — manual, in browser.
//   2. Scheduled auto-backup — nightly (after 02:00 PKT) write into BACKUP_DIR
//      when that env var is set; started once from src/instrumentation.js.
import { eq, and, desc, sql } from "drizzle-orm";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import * as s from "@/db/schema";
import { todayStr } from "./util.mjs";

// Full data snapshot for one business as a plain object (passwords redacted).
export async function buildBusinessBackup(businessId) {
  const b = businessId;
  return {
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
}

// Remember the download in the audit trail so the dashboard reminder knows a
// backup happened (userId may be null for automated runs).
export async function logBackupEvent(businessId, userId, action, detail) {
  try {
    await db.insert(s.auditLogs).values({ businessId, userId, action, entityType: "business", entityId: businessId, newValues: detail ? String(detail).slice(0, 300) : null });
  } catch { /* audit must never break the download */ }
}

// When the last manual download or auto backup happened, in whole days (null = never).
export async function lastBackupAgeDays(businessId, today) {
  const [row] = await db
    .select({ at: s.auditLogs.createdAt })
    .from(s.auditLogs)
    .where(and(eq(s.auditLogs.businessId, businessId), sql`${s.auditLogs.action} LIKE 'Backup%'`))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(1);
  if (!row?.at) return null;
  // createdAt comes back as a JS Date; compare calendar days in Karachi time,
  // same convention as todayStr().
  const thenD = new Date(row.at).toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  const nowD = String(today).slice(0, 10);
  const then = new Date(thenD + "T00:00:00Z");
  const now = new Date(nowD + "T00:00:00Z");
  return Math.max(0, Math.floor((now - then) / 86400000));
}

// ---- scheduled auto backup -------------------------------------------------
let lastAutoDate = null; // process-local; one run per day is enough

async function runAutoBackup(dir, dateLabel) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const bizs = await db.select({ id: s.businesses.id, name: s.businesses.name }).from(s.businesses);
  const files = [];
  for (const biz of bizs) {
    try {
      const dump = await buildBusinessBackup(biz.id);
      const slug = String(biz.name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "business";
      const file = join(dir, `faberp-${slug}-${biz.id}-${dateLabel}.json`);
      writeFileSync(file, JSON.stringify(dump), "utf8");
      files.push(file);
      await logBackupEvent(biz.id, null, "Backup auto-saved", file);
    } catch (e) {
      console.warn("[backup] auto backup failed for business", biz.id, ":", e?.message || e);
    }
  }
  return files;
}

// Run once per day (Karachi time) after 02:00 when BACKUP_DIR is configured.
export async function maybeRunAutoBackup(now = new Date()) {
  const dir = process.env.BACKUP_DIR;
  if (!dir) return null;
  const today = todayStr();
  if (lastAutoDate === today) return null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Karachi" }).format(now));
  if (hour < 2) return null; // wait for the quiet 02:00-06:00 window
  lastAutoDate = today;
  return runAutoBackup(dir, today);
}

export function startBackupScheduler() {
  if (!process.env.BACKUP_DIR) return;
  const tick = () => maybeRunAutoBackup().catch((e) => console.warn("[backup] scheduler tick failed:", e?.message || e));
  setInterval(tick, 30 * 60 * 1000); // 30-minute check; fires the daily run at the first tick after 02:00
  tick();
  console.log(`[backup] nightly auto-backup enabled → ${process.env.BACKUP_DIR}`);
}
