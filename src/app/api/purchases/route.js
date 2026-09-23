import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchases, suppliers, warehouses } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { createPurchase } from "@/server/services.mjs";

export const POST = api(async ({ user, req }) => createPurchase(user, await body(req)));

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const page = Math.max(1, Number(p.get("page") || 1));
  const per = 30;
  const conds = [eq(purchases.businessId, user.businessId)];
  if (p.get("q")) conds.push(ilike(purchases.purchaseNo, `%${p.get("q")}%`));
  if (p.get("supplierId")) conds.push(eq(purchases.supplierId, Number(p.get("supplierId"))));
  if (p.get("from")) conds.push(gte(purchases.date, p.get("from")));
  if (p.get("to")) conds.push(lte(purchases.date, p.get("to")));
  const where = and(...conds);
  const [agg] = await db.select({ n: sql`COUNT(*)`, total: sql`COALESCE(SUM(${purchases.total}::numeric),0)`, balance: sql`COALESCE(SUM(${purchases.balance}::numeric),0)` }).from(purchases).where(where);
  const rows = await db.select({
    id: purchases.id, purchaseNo: purchases.purchaseNo, refNo: purchases.refNo, date: purchases.date,
    total: purchases.total, paid: purchases.paid, balance: purchases.balance, status: purchases.status,
    supplier: suppliers.name, warehouse: warehouses.name,
  }).from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(warehouses, eq(warehouses.id, purchases.warehouseId))
    .where(where).orderBy(desc(purchases.date), desc(purchases.id)).limit(per).offset((page - 1) * per);
  return { rows, page, pages: Math.max(1, Math.ceil(Number(agg.n) / per)), totals: agg };
});
