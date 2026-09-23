import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { stockMovements, products, warehouses, users } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { adjustStock, transferStock } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  if (b.action === "adjust") return adjustStock(user, b);
  if (b.action === "transfer") return transferStock(user, b);
  throw new BizError("Action must be 'adjust' or 'transfer'");
});

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const limit = Math.min(Number(p.get("limit") || 80), 300);
  const conds = [eq(stockMovements.businessId, user.businessId)];
  if (p.get("productId")) conds.push(eq(stockMovements.productId, Number(p.get("productId"))));
  const rows = await db.select({
    id: stockMovements.id, date: stockMovements.createdAt, type: stockMovements.type, qty: stockMovements.qty,
    prevQty: stockMovements.prevQty, newQty: stockMovements.newQty, refNo: stockMovements.refNo, reason: stockMovements.reason,
    product: products.name, color: products.color, unit: products.unit, warehouse: warehouses.name, userName: users.name,
  }).from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(and(...conds)).orderBy(desc(stockMovements.id)).limit(limit);
  return { movements: rows };
});
