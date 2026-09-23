import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases, purchaseItems, products, suppliers, warehouses } from "@/db/schema";
import { api } from "@/server/api.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, ctx }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const [purchase] = await db.select({
    purchase: purchases, supplier: suppliers.name, supplierPhone: suppliers.phone, warehouse: warehouses.name,
  }).from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(warehouses, eq(warehouses.id, purchases.warehouseId))
    .where(and(eq(purchases.id, id), eq(purchases.businessId, user.businessId))).limit(1);
  if (!purchase) throw new BizError("Purchase not found", 404);
  const items = await db.select({
    item: purchaseItems, name: products.name, color: products.color, sku: products.sku, unit: products.unit,
  }).from(purchaseItems).innerJoin(products, eq(products.id, purchaseItems.productId)).where(eq(purchaseItems.purchaseId, id));
  return { purchase, items };
});
