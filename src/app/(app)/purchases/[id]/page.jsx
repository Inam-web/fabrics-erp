import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases, purchaseItems, products, suppliers, warehouses, businesses } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect, notFound } from "next/navigation";
import { money, qtyFmt, dateFmt } from "@/lib/format";
import { PrintButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PurchaseDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const [row] = await db.select({
    purchase: purchases, supplier: suppliers, warehouse: warehouses.name,
  }).from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .leftJoin(warehouses, eq(warehouses.id, purchases.warehouseId))
    .where(and(eq(purchases.id, Number(id)), eq(purchases.businessId, user.businessId))).limit(1);
  if (!row) notFound();
  const { purchase, supplier } = row;
  const items = await db.select({
    qty: purchaseItems.qty, rate: purchaseItems.rate, total: purchaseItems.total,
    name: products.name, color: products.color, sku: products.sku, unit: products.unit,
  }).from(purchaseItems).innerJoin(products, eq(products.id, purchaseItems.productId)).where(eq(purchaseItems.purchaseId, purchase.id));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link href="/purchases" className="text-xs font-bold text-mute hover:text-brand">← All purchases</Link>
        <PrintButton />
      </div>
      <div className="rounded-lg border border-line bg-white p-6 print-area">
        <div className="flex justify-between border-b-2 border-ink pb-3">
          <div>
            <div className="font-display text-xl font-bold">Purchase Receipt</div>
            <div className="tnum font-bold text-brand">{purchase.purchaseNo}{purchase.refNo ? ` · supplier ref ${purchase.refNo}` : ""}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold">{supplier.name}</div>
            <div className="text-mute">{supplier.city} · {supplier.phone}</div>
            <div className="text-mute">{dateFmt(purchase.date)} · into {row.warehouse}</div>
          </div>
        </div>
        <table className="tbl mt-3">
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Total</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="font-semibold">{it.name}{it.color ? ` · ${it.color}` : ""} <span className="text-mute font-normal">{it.sku}</span></td>
                <td className="num tnum">{qtyFmt(it.qty)} {it.unit}</td>
                <td className="num tnum">{money(it.rate)}</td>
                <td className="num tnum font-bold">{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end mt-3">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="tnum">{money(purchase.subtotal)}</span></div>
            {Number(purchase.discount) > 0 && <div className="flex justify-between"><span className="text-mute">Discount</span><span className="tnum">- {money(purchase.discount)}</span></div>}
            {Number(purchase.extraCost) > 0 && <div className="flex justify-between"><span className="text-mute">Delivery / landing</span><span className="tnum">+ {money(purchase.extraCost)}</span></div>}
            <div className="flex justify-between font-bold border-t border-ink pt-1"><span>Total</span><span className="tnum">{money(purchase.total)}</span></div>
            <div className="flex justify-between text-ok"><span>Paid</span><span className="tnum">{money(purchase.paid)}</span></div>
            <div className="flex justify-between font-bold text-danger"><span>Balance to pay</span><span className="tnum">{money(purchase.balance)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
