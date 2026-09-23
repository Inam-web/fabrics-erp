import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, stock, warehouses, salesmen, accounts, customerPrices } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { canOverride } from "@/server/util.mjs";
import { redirect } from "next/navigation";
import BillingClient from "./_billing";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function NewSalePage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const b = user.businessId;

  const [custs, prods, whs, sms, accs, stockRows, cps] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, code: customers.code, balance: customers.balance, creditLimit: customers.creditLimit, priceLevel: customers.priceLevel, category: customers.category, area: customers.area, phone: customers.phone }).from(customers).where(and(eq(customers.businessId, b), eq(customers.status, "active"))).orderBy(customers.name),
    db.select({ id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, color: products.color, design: products.design, brand: products.brand, unit: products.unit, wholesalePrice: products.wholesalePrice, retailPrice: products.retailPrice, vipPrice: products.vipPrice, gstRate: products.gstRate, minPrice: products.minPrice, saleDiscountPct: products.saleDiscountPct, notForSale: products.notForSale, mrp: products.mrp, active: products.active }).from(products).where(eq(products.businessId, b)).orderBy(products.name),
    db.select().from(warehouses).where(eq(warehouses.businessId, b)).orderBy(warehouses.name),
    db.select().from(salesmen).where(and(eq(salesmen.businessId, b), eq(salesmen.active, true))),
    db.select().from(accounts).where(eq(accounts.businessId, b)),
    db.select({ productId: stock.productId, warehouseId: stock.warehouseId, qty: stock.qty }).from(stock).where(eq(stock.businessId, b)),
    db.select().from(customerPrices).where(eq(customerPrices.businessId, b)),
  ]);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">{t("New Sale")}</h1>
        <div className="text-sm text-mute">Fast invoice entry — rates auto-pick from the customer's price level, stock checks run per godown.</div>
      </div>
      <BillingClient
        customers={custs} products={prods} stockRows={stockRows} warehouses={whs} salesmen={sms}
        accounts={accs} customerPrices={cps}
        defaultWarehouseId={whs.find((w) => w.isMain)?.id || whs[0]?.id}
        canOverride={canOverride(user.role)}
        initialCustomerId={sp.customer ? Number(sp.customer) : null}
        initialProductId={sp.product ? Number(sp.product) : null}
        retailWarehouseId={whs.find((w) => w.code === "RETAIL")?.id || whs[0]?.id}
      />
    </div>
  );
}
