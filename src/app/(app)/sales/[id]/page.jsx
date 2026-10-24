import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleItems, products, customers, salesmen, warehouses, payments, paymentAllocations, businesses } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { canOverride } from "@/server/util.mjs";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { money, money2, qtyFmt, dateFmt } from "@/lib/format";
import { Badge } from "@/components/ui";
import { InvoiceActions } from "./_client";
import { BRAND, brandMark } from "@/lib/brand.mjs";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const { id } = await params;
  const saleId = Number(id);

  const [row] = await db.select({
    sale: sales, customer: customers, salesman: salesmen.name, warehouse: warehouses.name,
  }).from(sales)
    .innerJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(salesmen, eq(salesmen.id, sales.salesmanId))
    .leftJoin(warehouses, eq(warehouses.id, sales.warehouseId))
    .where(and(eq(sales.id, saleId), eq(sales.businessId, user.businessId))).limit(1);
  if (!row) notFound();
  const { sale, customer } = row;

  const items = await db.select({
    productId: saleItems.productId, qty: saleItems.qty, rate: saleItems.rate, discount: saleItems.discount, total: saleItems.total,
    name: products.name, color: products.color, sku: products.sku, unit: products.unit, design: products.design, source: products.source,
  }).from(saleItems).innerJoin(products, eq(products.id, saleItems.productId)).where(eq(saleItems.saleId, saleId));
  const pays = await db.select({ payment: payments }).from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(eq(paymentAllocations.docType, "sale"), eq(paymentAllocations.docId, saleId)));
  const [business] = await db.select().from(businesses).where(eq(businesses.id, user.businessId)).limit(1);

  const totalQty = items.reduce((a, i) => a + Number(i.qty), 0);
  const gst = Number(sale.tax);
  const mono = business.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link href="/sales" className="text-xs font-bold text-mute hover:text-brand">← {t("All invoices")}</Link>
        <InvoiceActions saleId={saleId} customerId={sale.customerId} canOverride={canOverride(user.role)} items={items}
          sale={{ ...sale, customerName: customer.name }} customerPhone={customer.whatsapp || customer.phone} businessName={business.name} />
      </div>

      <div className="print-area relative overflow-hidden rounded-xl border border-line bg-white shadow-(--shadow-card)">
        {/* watermark */}
        <div aria-hidden className="pointer-events-none select-none absolute inset-0 flex items-center justify-center">
          <span className="font-display font-bold text-[190px] text-brand opacity-[0.045] -rotate-12">{mono}</span>
        </div>
        {sale.status === "void" && (
          <div className="relative m-6 mb-0 rounded-lg bg-danger-soft border border-danger/30 text-danger font-bold text-sm px-4 py-2.5">
            VOID — {sale.voidReason || "no reason recorded"}. Stock and khata have been reversed.
          </div>
        )}

        {/* ── letterhead band ── */}
        <div className="relative bg-night text-white px-8 py-6 flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            {business.logo
              ? <img src={business.logo} alt="logo" className="h-14 w-auto max-w-[120px] object-contain rounded-lg bg-white p-1" />
              : <img src={BRAND.mark} alt="" className="h-14 w-14 rounded-xl shrink-0 shadow-md" />}
            <div className="min-w-0">
              <div className="font-display text-[1.55rem] leading-tight font-bold">{business.name}</div>
              <div className="text-[0.78rem] text-white/65 mt-1">{business.address}</div>
              <div className="text-[0.78rem] text-white/65 tnum">Contact : {business.phone}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-white/50">(Original Copy)</div>
            <div className="mt-0.5">
              <span className="text-[0.8rem] uppercase tracking-[0.25em] text-[#e8c98a] font-extrabold">{sale.saleKind === "retail" ? "Retail " : ""}Invoice</span>
              <span className="font-display text-[1.6rem] font-bold tnum text-white ms-2">#{sale.invoiceNo.replace(/^INV-\d+-/, "")}</span>
            </div>
            <div className="text-[0.8rem] text-white/70 tnum mt-1">{dateFmt(sale.date)}</div>
          </div>
        </div>

        {/* ── info panels ── */}
        <div className="relative grid md:grid-cols-2 gap-5 px-8 py-6">
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="bg-brand-soft text-brand-deep text-[0.7rem] font-extrabold uppercase tracking-[0.12em] px-4 py-2">Bill To</div>
            <div className="px-4 py-3">
              <div className="font-bold text-[1rem]">{customer.name}</div>
              {customer.ownerName && <div className="text-[0.78rem] text-mute mt-0.5">{customer.ownerName}</div>}
              <div className="text-[0.78rem] text-mute mt-0.5">{customer.address}{customer.area ? `, ${customer.area}` : ""}{customer.city ? `, ${customer.city}` : ""}</div>
              <div className="text-[0.78rem] text-mute tnum mt-0.5">Phone : {customer.phone || "—"}</div>
            </div>
          </div>
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="bg-black/5 text-ink text-[0.7rem] font-extrabold uppercase tracking-[0.12em] px-4 py-2">Invoice Details</div>
            <div className="px-4 py-3 text-[0.8rem] space-y-1.5">
              <div className="flex justify-between gap-3"><span className="text-mute">Due Date</span><span className="font-semibold tnum">{dateFmt(sale.date)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-mute">A/c Balance</span><span className="font-semibold tnum">{money(customer.balance)} <span className="text-mute font-normal">Dr</span></span></div>
              <div className="flex justify-between gap-3"><span className="text-mute">Godown</span><span className="font-semibold">{row.warehouse}</span></div>
              <div className="flex justify-between gap-3"><span className="text-mute">Salesman</span><span className="font-semibold">{row.salesman || "Counter sale"}</span></div>
              <div className="flex justify-between gap-3 items-center"><span className="text-mute">Type</span>
                <span>{sale.saleKind === "retail" ? <Badge tone="accent">Retail</Badge> : <Badge tone="brand">Wholesale</Badge>}</span></div>
              {pays.length > 0 && (
                <div className="flex justify-between gap-3"><span className="text-mute">Receipts</span><span className="font-semibold tnum">{pays.map((p) => p.payment.receiptNo).join(", ")}</span></div>
              )}
            </div>
          </div>
        </div>

        {/* ── items ─ */}
        <div className="relative px-8">
          <table className="w-full text-[0.86rem] border-collapse rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-brand text-white">
                <th className="text-left font-extrabold px-4 py-2.5 w-12 text-[0.7rem] uppercase tracking-wider">S.No</th>
                <th className="text-left font-extrabold px-3 py-2.5 text-[0.7rem] uppercase tracking-wider">Description</th>
                <th className="text-right font-extrabold px-3 py-2.5 text-[0.7rem] uppercase tracking-wider">Qty</th>
                <th className="text-left font-extrabold px-2 py-2.5 w-16 text-[0.7rem] uppercase tracking-wider">Unit</th>
                <th className="text-right font-extrabold px-3 py-2.5 text-[0.7rem] uppercase tracking-wider">Unit Price</th>
                <th className="text-right font-extrabold px-4 py-2.5 text-[0.7rem] uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-[#f6f8f6]" : "bg-white"}>
                  <td className="px-4 py-2.5 text-mute tnum border-b border-line-soft">{i + 1}</td>
                  <td className="px-3 py-2.5 border-b border-line-soft">
                    <span className="font-bold">{it.name}{it.color ? ` ${it.color}` : ""}</span>
                    <span className="text-mute text-[0.76rem]"> · {it.design} · {it.sku}</span>
                    {it.source === "retail" && <span className="ms-1"><Badge tone="warn">{t("manual retail")}</Badge></span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tnum font-bold border-b border-line-soft">{qtyFmt(it.qty)}</td>
                  <td className="px-2 py-2.5 text-mute uppercase text-[0.7rem] border-b border-line-soft">{it.unit}</td>
                  <td className="px-3 py-2.5 text-right tnum border-b border-line-soft">{money2(it.rate)}</td>
                  <td className="px-4 py-2.5 text-right tnum font-bold border-b border-line-soft">{money(it.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-night text-white">
                <td colSpan={2} className="px-4 py-2.5 font-bold text-[0.8rem]">Total Qty : {qtyFmt(totalQty)}</td>
                <td colSpan={3} className="px-3 py-2.5 text-right font-extrabold tracking-[0.15em] uppercase text-[0.72rem]">Total</td>
                <td className="px-4 py-2.5 text-right tnum font-bold text-[#e8c98a]">{money(sale.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── terms + totals ── */}
        <div className="relative grid md:grid-cols-[1fr_330px] gap-8 px-8 py-7">
          <div>
            <div className={Number(sale.balance) > 0
              ? "inline-block -rotate-3 rounded-md border-2 border-warn px-3.5 py-1 text-warn font-extrabold tracking-[0.18em] text-[0.72rem] uppercase"
              : "inline-block -rotate-3 rounded-md border-2 border-ok px-3.5 py-1 text-ok font-extrabold tracking-[0.18em] text-[0.72rem] uppercase"}>
              {Number(sale.balance) > 0 ? "Balance Due" : "Paid in Full"}
            </div>
            <div className="font-bold text-[0.85rem] mt-4">Terms / Declaration</div>
            <p className="text-[0.76rem] text-mute mt-1.5 leading-relaxed max-w-md">
              {business.invoiceFooter || "Goods once sold are only returnable within 7 days with this invoice."}<br />
              {Number(sale.balance) > 0
                ? `Balance of ${money(sale.balance)} is outstanding on the customer khata.`
                : "This invoice is paid in full. Thank you for your business."}
            </p>
            <div className="flex gap-14 mt-14 text-[0.7rem] text-mute">
              <div className="text-center"><div className="border-t border-ink/35 pt-1.5 px-5">Customer Signature</div></div>
              <div className="text-center"><div className="border-t border-ink/35 pt-1.5 px-5">Authorized Signature</div></div>
            </div>
          </div>
          <div className="space-y-1.5 text-[0.84rem]">
            <div className="flex justify-between px-1"><span className="text-mute">Sub Total</span><span className="tnum font-semibold">{money(sale.subtotal)}</span></div>
            {Number(sale.discount) > 0 && <div className="flex justify-between px-1"><span className="text-mute">Discount</span><span className="tnum">- {money(sale.discount)}</span></div>}
            {gst > 0 && sale.gstMode === "intra" && (<>
              <div className="flex justify-between px-1"><span className="text-mute">CGST</span><span className="tnum">{money(gst / 2)}</span></div>
              <div className="flex justify-between px-1"><span className="text-mute">SGST</span><span className="tnum">{money(gst / 2)}</span></div>
            </>)}
            {gst > 0 && sale.gstMode === "inter" && <div className="flex justify-between px-1"><span className="text-mute">IGST</span><span className="tnum">{money(gst)}</span></div>}
            {Number(sale.paid) > 0 && <div className="flex justify-between px-1 text-ok"><span className="font-semibold">Received</span><span className="tnum font-semibold">{money(sale.paid)}</span></div>}
            {Number(sale.balance) > 0 && <div className="flex justify-between px-1 text-danger"><span className="font-semibold">Balance Due</span><span className="tnum font-semibold">{money(sale.balance)}</span></div>}
            <div className="flex justify-between items-center bg-accent text-white rounded-lg px-4 py-3 mt-2 shadow-md">
              <span className="font-extrabold tracking-[0.12em] uppercase text-[0.74rem]">Total Amount</span>
              <span className="tnum font-bold text-[1.1rem]">{money(sale.total)}</span>
            </div>
          </div>
        </div>

        {/* ── footer strip ── */}
        <div className="relative border-t border-line bg-[#fafaf6] px-8 py-3 flex flex-wrap justify-between gap-2 text-[0.68rem] text-mute rounded-b-xl">
          <span className="flex items-center gap-2"><img src={BRAND.mark} alt="" className="h-4 w-4 rounded" />{business.invoiceFooter || "Thank you for your business."}</span>
          <span className="tnum">{sale.invoiceNo} · {business.name} · {BRAND.name} ERP</span>
        </div>
      </div>
    </div>
  );
}
