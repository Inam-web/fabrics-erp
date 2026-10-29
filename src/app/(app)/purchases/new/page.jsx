import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, products, warehouses, accounts, stock } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import PurchaseForm from "../_form";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const b = user.businessId;
  const [sups, prods, whs, accs, stockRows] = await Promise.all([
    db.select().from(suppliers).where(and(eq(suppliers.businessId, b), eq(suppliers.status, "active"))).orderBy(suppliers.name),
    db.select().from(products).where(eq(products.businessId, b)).orderBy(products.name),
    db.select().from(warehouses).where(eq(warehouses.businessId, b)),
    db.select().from(accounts).where(eq(accounts.businessId, b)),
    db.select({ productId: stock.productId, warehouseId: stock.warehouseId, qty: stock.qty }).from(stock).where(eq(stock.businessId, b)),
  ]);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">New Purchase — Stock In</h1>
        <div className="text-sm text-mute">Receiving stock increases godown quantities and updates average cost. Unpaid amounts go to the supplier khata.</div>
      </div>
      <PurchaseForm suppliers={sups} products={prods} warehouses={whs} accounts={accs} stockRows={stockRows}
        defaultWarehouseId={whs.find((w) => w.name.toLowerCase().includes("godown"))?.id || whs[0]?.id} />
    </div>
  );
}
