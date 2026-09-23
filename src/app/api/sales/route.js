import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers, salesmen, warehouses } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { createSale } from "@/server/services.mjs";

export const POST = api(async ({ user, req }) => createSale(user, await body(req)));

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const page = Math.max(1, Number(p.get("page") || 1));
  const per = 30;
  const conds = [eq(sales.businessId, user.businessId)];
  if (p.get("q")) conds.push(ilike(sales.invoiceNo, `%${p.get("q")}%`));
  if (p.get("customerId")) conds.push(eq(sales.customerId, Number(p.get("customerId"))));
  if (p.get("from")) conds.push(gte(sales.date, p.get("from")));
  if (p.get("to")) conds.push(lte(sales.date, p.get("to")));
  if (p.get("status")) conds.push(eq(sales.status, p.get("status")));
  const where = and(...conds);
  const [agg] = await db.select({
    n: sql`COUNT(*)`, total: sql`COALESCE(SUM(${sales.total}::numeric),0)`, balance: sql`COALESCE(SUM(${sales.balance}::numeric),0)`,
  }).from(sales).where(where);
  const rows = await db.select({
    id: sales.id, invoiceNo: sales.invoiceNo, date: sales.date, total: sales.total, paid: sales.paid,
    balance: sales.balance, status: sales.status, isBackdated: sales.isBackdated,
    customer: customers.name, salesman: salesmen.name, warehouse: warehouses.name, createdAt: sales.createdAt,
  }).from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(salesmen, eq(salesmen.id, sales.salesmanId))
    .leftJoin(warehouses, eq(warehouses.id, sales.warehouseId))
    .where(where).orderBy(desc(sales.date), desc(sales.id)).limit(per).offset((page - 1) * per);
  return { rows, page, pages: Math.max(1, Math.ceil(Number(agg.n) / per)), totals: agg };
});
