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

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link href="/sales" className="text-xs font-bold text-mute hover:text-brand">← All invoices</Link>
        <InvoiceActions saleId={saleId} customerId={sale.customerId} canOverride={canOverride(user.role)} items={items}
          sale={{ ...sale, customerName: customer.name }} customerPhone={customer.whatsapp || customer.phone} businessName={business.name} />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 print-area" id="print-root">
        {sale.status === "void" && (
          <div className="mb-4 rounded-md bg-danger-soft border border-danger/30 text-danger font-bold text-sm px-3 py-2">
            VOID — {sale.voidReason || "no reason recorded"}. Stock and khata have been reversed.
          </div>
        )}
        <div className="flex justify-between items-start border-b-2 border-ink pb-4">
          <div className="flex items-start gap-3">
            {business.logo && <img src={business.logo} alt="logo" className="h-14 w-auto max-w-[120px] object-contain" />}
            <div>
              <div className="font-display text-2xl font-bold">{business.name}</div>
              <div className="text-sm text-mute">{business.address}</div>
              <div className="text-sm text-mute tnum">{business.phone}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold">{sale.saleKind === "retail" ? t("Retail") + " " : "TAX "}INVOICE</div>
            <div className="tnum text-lg font-bold text-brand">{sale.invoiceNo}</div>
            <div className="text-sm text-mute">{dateFmt(sale.date)}{sale.isBackdated ? " · backdated entry" : ""}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-4 text-sm">
          <div>
            <div className="text-[0.65rem] uppercase font-bold text-mute tracking-wide">Billed to</div>
            <div className="font-bold">{customer.name}</div>
            <div className="text-mute">{customer.ownerName}</div>
            <div className="text-mute">{customer.address}{customer.area ? `, ${customer.area}` : ""}</div>
            <div className="text-mute tnum">{customer.phone}</div>
          </div>
          <div>
            <div className="text-[0.65rem] uppercase font-bold text-mute tracking-wide">Godown</div>
            <div className="font-semibold">{row.warehouse}</div>
            <div className="text-[0.65rem] uppercase font-bold text-mute tracking-wide mt-2">Salesman</div>
            <div className="font-semibold">{row.salesman || "Counter sale"}</div>
          </div>
          <div className="text-right">
            <div className="text-[0.65rem] uppercase font-bold text-mute tracking-wide">Previous khata balance</div>
            <div className="tnum font-bold">{money(sale.prevBalance)}</div>
          </div>
        </div>

        <table className="tbl border-t border-line">
          <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="text-mute">{i + 1}</td>
                <td><span className="font-semibold">{it.name}</span> <span className="text-mute">{it.color} · {it.design} · {it.sku}</span>{it.source === "retail" && <span className="ml-1"><Badge tone="warn">{t("manual retail")}</Badge></span>}</td>
                <td className="num tnum whitespace-nowrap">{qtyFmt(it.qty)} {it.unit}</td>
                <td className="num tnum">{money2(it.rate)}</td>
                <td className="num tnum">{Number(it.discount) ? money(it.discount) : "—"}</td>
                <td className="num tnum font-bold">{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-3">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="tnum">{money(sale.subtotal)}</span></div>
            {Number(sale.discount) > 0 && <div className="flex justify-between"><span className="text-mute">Discount</span><span className="tnum">- {money(sale.discount)}</span></div>}
            {Number(sale.tax) > 0 && sale.gstMode === "intra" && (
              <>
                <div className="flex justify-between"><span className="text-mute">CGST</span><span className="tnum">{money(Number(sale.tax) / 2)}</span></div>
                <div className="flex justify-between"><span className="text-mute">SGST</span><span className="tnum">{money(Number(sale.tax) / 2)}</span></div>
              </>
            )}
            {Number(sale.tax) > 0 && sale.gstMode === "inter" && <div className="flex justify-between"><span className="text-mute">IGST</span><span className="tnum">{money(sale.tax)}</span></div>}
            {Number(sale.tax) > 0 && sale.gstMode !== "intra" && sale.gstMode !== "inter" && <div className="flex justify-between"><span className="text-mute">Tax</span><span className="tnum">{money(sale.tax)}</span></div>}
            <div className="flex justify-between border-t-2 border-ink pt-1 font-bold text-base"><span>Total</span><span className="tnum">{money(sale.total)}</span></div>
            <div className="flex justify-between text-ok"><span>Received now</span><span className="tnum">{money(sale.paid)}</span></div>
            <div className="flex justify-between font-bold text-danger"><span>Balance (udhaar)</span><span className="tnum">{money(sale.balance)}</span></div>
          </div>
        </div>

        {pays.length > 0 && (
          <div className="mt-4 text-xs text-mute">
            Payments on this invoice: {pays.map((p) => `${p.payment.receiptNo} (${money(p.payment.amount)}, ${p.payment.method})`).join(" · ")}
          </div>
        )}
        {sale.notes && <div className="mt-3 text-xs text-mute">Note: {sale.notes}</div>}
        <div className="mt-8 pt-3 border-t border-line text-xs text-mute flex justify-between">
          <span>{business.invoiceFooter || "Thank you for your business."}</span>
          <span className="tnum">Khata after invoice: {money(Number(sale.prevBalance) + Number(sale.balance))}</span>
        </div>
      </div>
    </div>
  );
}
