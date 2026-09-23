import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stock, stockMovements, warehouses } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const q = p.get("q") || "";
  const conds = [eq(products.businessId, user.businessId)];
  if (q) conds.push(or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.barcode, `%${q}%`), ilike(products.color, `%${q}%`), ilike(products.design, `%${q}%`), ilike(products.brand, `%${q}%`)));
  if (p.get("low") === "1") conds.push(sql`${products.reorderLevel}::numeric > 0`);
  const stockAgg = db.select({
    productId: stock.productId,
    qty: sql`SUM(${stock.qty}::numeric)`.as("qty"),
    val: sql`SUM(${stock.qty}::numeric * ${stock.avgCost}::numeric)`.as("val"),
  }).from(stock).where(eq(stock.businessId, user.businessId)).groupBy(stock.productId).as("sa");
  const rows = await db.select({
    id: products.id, sku: products.sku, barcode: products.barcode, name: products.name, design: products.design,
    color: products.color, brand: products.brand, widthIn: products.widthIn, unit: products.unit,
    source: products.source,
    costPrice: products.costPrice, wholesalePrice: products.wholesalePrice,
    retailPrice: products.retailPrice, vipPrice: products.vipPrice, reorderLevel: products.reorderLevel,
    active: products.active, quality: products.quality, season: products.season, gstRate: products.gstRate,
    hsn: products.hsn, minPrice: products.minPrice, mrp: products.mrp, saleDiscountPct: products.saleDiscountPct,
    productType: products.productType, notForSale: products.notForSale, description: products.description,
    qty: sql`COALESCE(${stockAgg.qty},0)`,
    stockValue: sql`COALESCE(${stockAgg.val},0)`,
  }).from(products).leftJoin(stockAgg, eq(stockAgg.productId, products.id)).where(and(...conds)).orderBy(asc(products.name), asc(products.color)).limit(500);
  const byWarehouse = await db.select({
    productId: stock.productId, warehouseId: stock.warehouseId, warehouse: warehouses.name, qty: stock.qty, avgCost: stock.avgCost,
  }).from(stock).innerJoin(warehouses, eq(warehouses.id, stock.warehouseId)).where(eq(stock.businessId, user.businessId));
  return { products: rows, byWarehouse };
});

export const POST = api(async ({ user, req }) => {
  if (!["owner", "manager", "warehouse"].includes(user.role)) throw new BizError("Only owner, manager or warehouse staff can add fabrics", 403);
  const b = await body(req);
  if (!b.name?.trim()) throw new BizError("Product name is required");
  const source = b.source === "retail" ? "retail" : "wholesale";
  const openQty = Number(b.openingStock) || 0;
  if (openQty < 0) throw new BizError("Opening stock cannot be negative");
  if (openQty > 0 && !b.warehouseId && source !== "retail") throw new BizError("Select a godown for the opening stock");
  return db.transaction(async (t) => {
    // manual retail products live in the dedicated Retail Shop godown by default
    let whId = b.warehouseId ? Number(b.warehouseId) : null;
    if (source === "retail" && openQty > 0 && !whId) {
      const [rw] = await t.select({ id: warehouses.id }).from(warehouses)
        .where(and(eq(warehouses.businessId, user.businessId), eq(warehouses.code, "RETAIL"))).limit(1);
      if (rw) whId = rw.id;
    }
    const [count] = await t.select({ n: sql`COUNT(*)` }).from(products).where(eq(products.businessId, user.businessId));
    const sku = b.sku?.trim() || `ITM-${String(Number(count.n) + 101)}`;
    const [row] = await t.insert(products).values({
      businessId: user.businessId, sku, barcode: b.barcode || null, name: b.name.trim(),
      fabricType: b.group || b.name.trim(), design: b.design || "Plain", color: b.color || null,
      brand: b.brand || null, collection: b.collection || null, season: b.season || null,
      quality: b.quality || "Standard", widthIn: b.widthIn ? String(b.widthIn) : null,
      unit: b.unit || "meter", source,
      costPrice: String(b.costPrice || 0), wholesalePrice: String(b.wholesalePrice || 0),
      retailPrice: String(b.retailPrice || 0), vipPrice: String(b.vipPrice || b.wholesalePrice || 0),
      reorderLevel: String(b.reorderLevel || 0), gstRate: String(b.gstRate || 0),
      hsn: b.hsn || null, minPrice: String(b.minPrice || 0), mrp: String(b.mrp || 0),
      saleDiscountPct: String(b.saleDiscountPct || 0), productType: b.productType || "General",
      notForSale: !!b.notForSale, description: b.description || null,
    }).returning({ id: products.id });
    if (openQty > 0) {
      const cost = Number(b.costPrice) || 0;
      if (!whId) throw new BizError("Select a godown for the opening stock");
      await t.insert(stock).values({ businessId: user.businessId, productId: row.id, warehouseId: whId, qty: String(openQty), avgCost: String(cost) });
      await t.insert(stockMovements).values({
        businessId: user.businessId, productId: row.id, warehouseId: whId, type: "opening",
        qty: String(openQty), prevQty: "0", newQty: String(openQty), refType: "product_create", userId: user.id,
        reason: "Opening stock",
      });
    }
    return { id: row.id };
  });
});
