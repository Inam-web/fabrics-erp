import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleItems, products, customers, salesmen, warehouses, payments, paymentAllocations, businesses } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { voidSale } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, ctx }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const [sale] = await db.select({
    sale: sales, customer: customers.name, customerPhone: customers.phone, customerAddress: customers.address,
    customerBalance: customers.balance, salesman: salesmen.name, warehouse: warehouses.name,
  }).from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(salesmen, eq(salesmen.id, sales.salesmanId))
    .leftJoin(warehouses, eq(warehouses.id, sales.warehouseId))
    .where(and(eq(sales.id, id), eq(sales.businessId, user.businessId))).limit(1);
  if (!sale) throw new BizError("Invoice not found", 404);
  const items = await db.select({
    item: saleItems, name: products.name, color: products.color, sku: products.sku, unit: products.unit, design: products.design,
  }).from(saleItems).innerJoin(products, eq(products.id, saleItems.productId)).where(eq(saleItems.saleId, id));
  const allocs = await db.select({ payment: payments }).from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.docType, "sale"), eq(paymentAllocations.docId, id)));
  const [business] = await db.select().from(businesses).where(eq(businesses.id, user.businessId)).limit(1);
  return { sale, items, payments: allocs.map((a) => a.payment), business };
});

export const POST = api(async ({ user, ctx, req }) => {
  const params = await ctx.params;
  const b = await body(req);
  if (b.action === "void") {
    await voidSale(user, Number(params.id), b.reason);
    return { ok: true };
  }
  throw new BizError("Unknown action");
});
