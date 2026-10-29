import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesmen } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { demoGuard, postJournal } from "@/server/services.mjs";
import { BizError, todayStr } from "@/server/util.mjs";

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const q = p.get("q") || "";
  const cat = p.get("category") || "";
  const overdue = p.get("overdue") === "1";
  const limit = Math.min(Number(p.get("limit") || 100), 300);
  const conds = [eq(customers.businessId, user.businessId)];
  if (q) conds.push(or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.code, `%${q}%`), ilike(customers.area, `%${q}%`)));
  if (cat) conds.push(eq(customers.category, cat));
  if (overdue) conds.push(sql`${customers.balance}::numeric > 0`);
  const rows = await db.select({
    id: customers.id, code: customers.code, name: customers.name, ownerName: customers.ownerName,
    phone: customers.phone, area: customers.area, category: customers.category, priceLevel: customers.priceLevel,
    balance: customers.balance, creditLimit: customers.creditLimit, weeklyOgrai: customers.weeklyOgrai,
    paymentTerms: customers.paymentTerms, status: customers.status, salesman: salesmen.name, createdAt: customers.createdAt,
  }).from(customers).leftJoin(salesmen, eq(salesmen.id, customers.salesmanId))
    .where(and(...conds)).orderBy(asc(customers.name)).limit(limit);
  return { customers: rows };
});

export const POST = api(async ({ user, req }) => {
  await demoGuard(user, "customers");
  const b = await body(req);
  if (!b.name?.trim()) throw new BizError("Business name is required");
  const [count] = await db.select({ n: sql`COUNT(*)` }).from(customers).where(eq(customers.businessId, user.businessId));
  const code = b.code?.trim() || `CUST-${String(Number(count.n) + 1).padStart(3, "0")}`;
  const dup = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.businessId, user.businessId), eq(customers.name, b.name.trim()))).limit(1);
  if (dup.length) throw new BizError(`A customer named “${b.name.trim()}” already exists`);
  const [row] = await db.insert(customers).values({
    businessId: user.businessId, code, name: b.name.trim(), ownerName: b.ownerName || null,
    phone: b.phone || null, whatsapp: b.whatsapp || b.phone || null, address: b.address || null,
    city: b.city || "Peshawar", area: b.area || null, cnic: b.cnic || null,
    category: b.category || "wholesale", priceLevel: b.priceLevel || "wholesale",
    discountPct: String(b.discountPct || 0), creditLimit: String(b.creditLimit || 0),
    paymentTerms: b.paymentTerms || "weekly", weeklyOgrai: String(b.weeklyOgrai || 0),
    salesmanId: b.salesmanId || null, openingBalance: String(b.openingBalance || 0), balance: String(b.openingBalance || 0),
    notes: b.notes || null, status: "active",
  }).returning({ id: customers.id });
  // Journal the opening balance so Trial Balance AR matches the customer khata totals.
  const ob = Number(b.openingBalance || 0);
  if (ob) await postJournal(db, user.businessId, {
    date: todayStr(), refType: "opening", refId: row.id, memo: `Opening balance — ${b.name.trim()}`,
    lines: ob > 0
      ? [{ code: "AR", entityId: row.id, debit: ob }, { code: "CAPITAL", credit: ob }]
      : [{ code: "AR", entityId: row.id, credit: -ob }, { code: "CAPITAL", debit: -ob }],
  });
  return { id: row.id };
});
