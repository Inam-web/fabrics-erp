import Link from "next/link";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stock, warehouses } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { getLang, makeT } from "@/lib/i18n";
import { money, qtyFmt, dateShort, dtFmt } from "@/lib/format";
import { Card, Badge } from "@/components/ui";
import { redirect, notFound } from "next/navigation";
import ProductActions from "./_client";

export const dynamic = "force-dynamic";

async function rows(q) {
  return (await db.execute(sql.raw(q))).rows;
}

export default async function ProductDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const { id } = await params;
  const pid = Number(id);

  const [product] = await db.select().from(products).where(and(eq(products.id, pid), eq(products.businessId, user.businessId))).limit(1);
  if (!product) notFound();

  const whs = await db.select().from(warehouses).where(eq(warehouses.businessId, user.businessId));
  const stockRows = await db.select({ warehouse: warehouses.name, qty: stock.qty, avgCost: stock.avgCost })
    .from(stock).innerJoin(warehouses, eq(warehouses.id, stock.warehouseId))
    .where(eq(stock.productId, pid));
  const totalQty = stockRows.reduce((a, r) => a + Number(r.qty), 0);
  const totalValue = stockRows.reduce((a, r) => a + Number(r.qty) * Number(r.avgCost), 0);
  const whQty = {};
  for (const r of stockRows) whQty[r.warehouse] = Number(r.qty);
  const low = Number(product.reorderLevel) > 0 && totalQty <= Number(product.reorderLevel);

  const [saleAgg] = await rows(`SELECT COALESCE(sum(i.qty::numeric),0) qty, COALESCE(sum(i.total::numeric),0) rev,
      COALESCE(sum(i.total::numeric - i.qty::numeric*i.cost_rate::numeric),0) profit,
      count(DISTINCT s.id) invoices, max(s.date) last_date
      FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=${pid} AND s.status='final'`);
  const [buyAgg] = await rows(`SELECT COALESCE(sum(i.qty::numeric),0) qty, COALESCE(avg(i.rate::numeric),0) avgrate, max(s.date) last_date
      FROM purchase_items i JOIN purchases s ON s.id=i.purchase_id WHERE i.product_id=${pid} AND s.status='final'`);
  const [retAgg] = await rows(`SELECT COALESCE(sum(i.qty::numeric),0) q FROM sales_return_items i JOIN sales_returns r ON r.id=i.return_id WHERE i.product_id=${pid}`);
  const [pretAgg] = await rows(`SELECT COALESCE(sum(i.qty::numeric),0) q FROM purchase_return_items i JOIN purchase_returns r ON r.id=i.return_id WHERE i.product_id=${pid}`);
  const weeks = await rows(`SELECT to_char(date_trunc('week', s.date)::date,'MM-DD') wk, COALESCE(sum(i.qty::numeric),0) qty, COALESCE(sum(i.total::numeric),0) rev
      FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.product_id=${pid} AND s.status='final' AND s.date::date >= current_date - 56
      GROUP BY 1 ORDER BY 1 DESC LIMIT 8`);
  const tops = await rows(`SELECT c.name, COALESCE(sum(i.qty::numeric),0) qty, COALESCE(sum(i.total::numeric),0) rev
      FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN customers c ON c.id=s.customer_id
      WHERE i.product_id=${pid} AND s.status='final' GROUP BY c.name ORDER BY rev DESC LIMIT 5`);
  const movs = await rows(`SELECT m.created_at at, m.type, m.qty::numeric q, m.prev_qty::numeric pq, m.new_qty::numeric nq, m.reason, m.ref_no, w.name wh, u.name usr
      FROM stock_movements m JOIN warehouses w ON w.id=m.warehouse_id LEFT JOIN users u ON u.id=m.user_id
      WHERE m.product_id=${pid} ORDER BY m.id DESC LIMIT 20`);

  const rev = Number(saleAgg?.rev || 0), profit = Number(saleAgg?.profit || 0);
  const maxWeekQty = Math.max(1, ...weeks.map((w) => Number(w.qty)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/inventory" className="text-xs font-bold text-mute hover:text-brand no-print">← {t("Inventory")}</Link>
          <h1 className="font-display text-xl font-bold flex items-center gap-2">
            {product.name}{product.color ? ` · ${product.color}` : ""}
            {low && <Badge tone="danger">{t("low")}</Badge>}
            {product.notForSale && <Badge tone="mute">{t("Not For Sale")}</Badge>}
          </h1>
          <div className="text-sm text-mute mt-0.5">
            {product.sku}{product.hsn ? ` · HSN ${product.hsn}` : ""}{product.brand ? ` · ${product.brand}` : ""} · {product.design} · {product.productType}
            {product.widthIn ? ` · ${product.widthIn}"` : ""} · {product.unit}
          </div>
        </div>
        <ProductActions product={product} warehouses={whs} whQty={whQty} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Stock")}</div><div className={`tnum font-bold text-lg ${low ? "text-danger" : ""}`}>{qtyFmt(totalQty)} {product.unit}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Stock Value")}</div><div className="tnum font-bold text-lg">{money(totalValue)}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Qty")}</div><div className="tnum font-bold text-lg">{qtyFmt(saleAgg?.qty || 0)}</div><div className="text-[0.65rem] text-mute">{t("Sales")}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Revenue")}</div><div className="tnum font-bold text-lg">{money(rev)}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Gross profit")}</div><div className="tnum font-bold text-lg text-ok">{money(profit)}</div><div className="text-[0.65rem] text-mute">{rev ? Math.round((profit / rev) * 100) : 0}% {t("margin")}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Invoices")}</div><div className="tnum font-bold text-lg">{String(saleAgg?.invoices || 0)}</div><div className="text-[0.65rem] text-mute">{saleAgg?.last_date ? `${t("Last Sale")}: ${dateShort(saleAgg.last_date)}` : "—"}</div></Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-display font-bold text-sm mb-2">{t("Stock by godown")}</h3>
          <table className="tbl">
            <thead><tr><th>{t("Godown")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Avg cost")}</th><th className="num">{t("Value")}</th></tr></thead>
            <tbody>
              {stockRows.map((r, i) => (
                <tr key={i}><td className="font-semibold">{r.warehouse}</td><td className="num tnum">{qtyFmt(r.qty)}</td><td className="num tnum">{money(r.avgCost)}</td><td className="num tnum font-bold">{money(Number(r.qty) * Number(r.avgCost))}</td></tr>
              ))}
              {stockRows.length === 0 && <tr><td colSpan="4" className="text-mute text-center py-4">{t("No results")}</td></tr>}
            </tbody>
          </table>
          {low && <div className="mt-2 rounded-md bg-danger-soft border border-danger/25 px-3 py-2 text-xs font-semibold text-danger">{t("low")}: ≤ {qtyFmt(product.reorderLevel)} {product.unit}</div>}
        </Card>

        <Card>
          <h3 className="font-display font-bold text-sm mb-2">{t("Pricing")}</h3>
          <table className="tbl">
            <tbody>
              <tr><td>{t("Purchase Price (PKR)")}</td><td className="num tnum font-bold">{money(product.costPrice)}</td></tr>
              <tr><td>{t("Wholesale Sale Price (PKR)")}</td><td className="num tnum font-bold">{money(product.wholesalePrice)}</td></tr>
              <tr><td>{t("Retail Price (PKR)")}</td><td className="num tnum">{money(product.retailPrice)}</td></tr>
              <tr><td>{t("VIP Price (PKR)")}</td><td className="num tnum">{money(product.vipPrice)}</td></tr>
              <tr><td>{t("Minimum Sale Price (PKR)")}</td><td className="num tnum">{Number(product.minPrice) ? money(product.minPrice) : "—"}</td></tr>
              <tr><td>{t("M.R.P. (PKR)")}</td><td className="num tnum">{Number(product.mrp) ? money(product.mrp) : "—"}</td></tr>
              <tr><td>{t("GST Rate %")}</td><td className="num tnum">{product.gstRate}%</td></tr>
              <tr><td>{t("Sale Discount %")}</td><td className="num tnum">{Number(product.saleDiscountPct) ? `${product.saleDiscountPct}%` : "—"}</td></tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="font-display font-bold text-sm mb-2">{t("Purchases & returns")}</h3>
          <table className="tbl">
            <tbody>
              <tr><td>{t("Purchases")}</td><td className="num tnum font-bold">{qtyFmt(buyAgg?.qty || 0)} {product.unit}</td></tr>
              <tr><td>{t("Avg cost")}</td><td className="num tnum">{money(buyAgg?.avgrate || 0)}</td></tr>
              <tr><td>{t("Last purchase")}</td><td className="num tnum">{buyAgg?.last_date ? dateShort(buyAgg.last_date) : "—"}</td></tr>
              <tr><td>{t("Returns")}</td><td className="num tnum">{qtyFmt(retAgg?.q || 0)} {product.unit}</td></tr>
              <tr><td>{t("Purchase returns")}</td><td className="num tnum">{qtyFmt(pretAgg?.q || 0)} {product.unit}</td></tr>
            </tbody>
          </table>
          <h4 className="font-display font-bold text-xs mt-3 mb-1">{t("Top customers")}</h4>
          <table className="tbl">
            <tbody>
              {tops.map((r, i) => (
                <tr key={i}><td className="font-semibold">{r.name}</td><td className="num tnum">{qtyFmt(r.qty)}</td><td className="num tnum font-bold">{money(r.rev)}</td></tr>
              ))}
              {tops.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-3">{t("No results")}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <h3 className="font-display font-bold text-sm mb-2">{t("Sales trend (8 weeks)")}</h3>
          <div className="flex items-end gap-1.5 h-28">
            {[...weeks].reverse().map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${w.wk}: ${qtyFmt(w.qty)} ${product.unit} · ${money(w.rev)}`}>
                <div className="w-full rounded-t bg-brand" style={{ height: `${Math.max(4, (Number(w.qty) / maxWeekQty) * 100)}%` }} />
                <div className="text-[0.58rem] text-mute tnum">{w.wk}</div>
              </div>
            ))}
            {weeks.length === 0 && <div className="text-sm text-mute py-6 text-center w-full">{t("No results")}</div>}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="font-display font-bold text-sm mb-2">{t("Stock Movements")}</h3>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Date")}</th><th>{t("Type")}</th><th>{t("Godown")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Prev")} → {t("New")}</th><th>{t("Ref")}</th><th>{t("By / Reason")}</th></tr></thead>
              <tbody>
                {movs.map((m, i) => (
                  <tr key={i}>
                    <td className="text-mute text-xs whitespace-nowrap">{dtFmt(m.at)}</td>
                    <td><Badge tone={["sale", "adjust_out", "damage", "transfer_out", "purchase_return"].includes(m.type) ? "danger" : "ok"}>{m.type.replace("_", " ")}</Badge></td>
                    <td className="text-xs">{m.wh}</td>
                    <td className={`num tnum font-bold ${Number(m.q) < 0 ? "text-danger" : "text-ok"}`}>{Number(m.q) > 0 ? "+" : ""}{qtyFmt(m.q)}</td>
                    <td className="num tnum text-xs text-mute">{qtyFmt(m.pq)} → {qtyFmt(m.nq)}</td>
                    <td className="text-xs tnum">{m.ref_no || "—"}</td>
                    <td className="text-xs text-mute">{m.usr || "system"}{m.reason ? ` · ${m.reason}` : ""}</td>
                  </tr>
                ))}
                {movs.length === 0 && <tr><td colSpan="7" className="text-mute text-center py-6">{t("No results")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {product.description && <Card><h3 className="font-display font-bold text-sm mb-1">{t("Description / Notes")}</h3><p className="text-sm text-mute">{product.description}</p></Card>}
    </div>
  );
}
