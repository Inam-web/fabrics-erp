import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stock, warehouses, stockMovements, users } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import InventoryClient from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const b = user.businessId;

  const stockAgg = db.select({
    productId: stock.productId,
    qty: sql`SUM(${stock.qty}::numeric)`.as("qty"),
    val: sql`SUM(${stock.qty}::numeric * ${stock.avgCost}::numeric)`.as("val"),
  }).from(stock).where(eq(stock.businessId, b)).groupBy(stock.productId).as("sa");
  const prods = await db.select({
    id: products.id, sku: products.sku, barcode: products.barcode, name: products.name, design: products.design,
    color: products.color, brand: products.brand, widthIn: products.widthIn, unit: products.unit,
    quality: products.quality, reorderLevel: products.reorderLevel, source: products.source,
    wholesalePrice: products.wholesalePrice, retailPrice: products.retailPrice, vipPrice: products.vipPrice,
    minPrice: products.minPrice, mrp: products.mrp, hsn: products.hsn, saleDiscountPct: products.saleDiscountPct,
    notForSale: products.notForSale, productType: products.productType, description: products.description,
    gstRate: products.gstRate,
    qty: sql`COALESCE(${stockAgg.qty},0)`,
    stockValue: sql`COALESCE(${stockAgg.val},0)`,
  }).from(products).leftJoin(stockAgg, eq(stockAgg.productId, products.id))
    .where(and(eq(products.businessId, b), sql`COALESCE(${products.source},'wholesale') <> 'retail'`))
    .orderBy(products.name, products.color);

  const [whs, byWh, movs] = await Promise.all([
    db.select().from(warehouses).where(eq(warehouses.businessId, b)),
    db.select({ productId: stock.productId, warehouseId: stock.warehouseId, qty: stock.qty }).from(stock).where(eq(stock.businessId, b)),
    db.select({
      id: stockMovements.id, createdAt: stockMovements.createdAt, date: stockMovements.createdAt, type: stockMovements.type,
      qty: stockMovements.qty, prevQty: stockMovements.prevQty, newQty: stockMovements.newQty, refNo: stockMovements.refNo,
      reason: stockMovements.reason, productId: stockMovements.productId,
      product: products.name, color: products.color, warehouse: warehouses.name, userName: users.name,
    }).from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(and(eq(stockMovements.businessId, b), sql`COALESCE(${products.source},'wholesale') <> 'retail'`))
      .orderBy(desc(stockMovements.id)).limit(250),
  ]);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">{t("Inventory")}</h1>
        <div className="text-sm text-mute">Stock belongs to a godown. Every purchase, sale, return, adjustment and transfer writes an immutable movement line.</div>
      </div>
      <InventoryClient products={prods} byWarehouse={byWh} warehouses={whs} movements={movs} />
    </div>
  );
}
