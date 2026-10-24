import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, customers, suppliers, accounts, paymentAllocations, sales, purchases, cheques } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { canOverride } from "@/server/util.mjs";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { money, dateFmt, title } from "@/lib/format";
import { Badge } from "@/components/ui";
import { PaymentActions } from "./_client";

export const dynamic = "force-dynamic";

export default async function PaymentDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const { id } = await params;
  const pid = Number(id);

  const [row] = await db.select({
    pay: payments, account: accounts.name, accountType: accounts.type,
    customer: customers.name, customerId: customers.id, supplier: suppliers.name, supplierId: suppliers.id,
    cheque: cheques.chequeNo, chequeStatus: cheques.status,
  }).from(payments)
    .leftJoin(customers, and(eq(customers.id, payments.partyId), eq(payments.partyType, "customer")))
    .leftJoin(suppliers, and(eq(suppliers.id, payments.partyId), eq(payments.partyType, "supplier")))
    .innerJoin(accounts, eq(accounts.id, payments.accountId))
    .leftJoin(cheques, eq(cheques.id, payments.chequeId))
    .where(and(eq(payments.id, pid), eq(payments.businessId, user.businessId))).limit(1);
  if (!row) notFound();
  const { pay } = row;
  const partyName = pay.partyType === "customer" ? row.customer : row.supplier;
  const partyLink = pay.partyType === "customer" ? `/customers/${row.customerId}` : `/suppliers/${row.supplierId}`;

  const allocs = await db.select({
    amount: paymentAllocations.amount, status: paymentAllocations.status, docType: paymentAllocations.docType,
    invoiceNo: sales.invoiceNo, saleId: sales.id, purchaseNo: purchases.purchaseNo, purchaseId: purchases.id,
  }).from(paymentAllocations)
    .leftJoin(sales, and(eq(sales.id, paymentAllocations.docId), eq(paymentAllocations.docType, "sale")))
    .leftJoin(purchases, and(eq(purchases.id, paymentAllocations.docId), eq(paymentAllocations.docType, "purchase")))
    .where(eq(paymentAllocations.paymentId, pid));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between no-print">
        <Link href={partyLink} className="text-xs font-bold text-mute hover:text-brand">← {partyName}</Link>
        <PaymentActions payment={pay} partyName={partyName} canManage={canOverride(user.role)} />
      </div>

      <div className="rounded-xl border border-line bg-white shadow-(--shadow-card) overflow-hidden">
        <div className="bg-night text-white px-6 py-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-white/50">{pay.partyType === "customer" ? "Payment Received" : "Payment Made"}</div>
            <div className="font-display text-xl font-bold tnum mt-0.5">{pay.receiptNo}</div>
            <div className="text-[0.8rem] text-white/70 mt-1">{dateFmt(pay.date)}</div>
          </div>
          <div className="text-right">
            <div className="tnum text-2xl font-bold text-[#e8c98a]">{money(pay.amount)}</div>
            <div className="mt-1">{pay.status === "final" ? <Badge tone="ok">final</Badge> : <Badge tone="danger">reversed</Badge>}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 px-6 py-5 text-[0.85rem]">
          <div className="flex justify-between gap-3"><span className="text-mute">{t("Customer")}/{t("Supplier")}</span><Link href={partyLink} className="font-semibold hover:text-brand">{partyName}</Link></div>
          <div className="flex justify-between gap-3"><span className="text-mute">{t("Method")}</span><span className="font-semibold">{title(pay.method)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-mute">Account</span><span className="font-semibold">{row.account} <span className="text-mute">({row.accountType})</span></span></div>
          <div className="flex justify-between gap-3"><span className="text-mute">Salesman</span><span className="font-semibold">{pay.salesmanId ? "—" : "—"}</span></div>
          {row.cheque && (
            <div className="flex justify-between gap-3"><span className="text-mute">Cheque</span><span className="font-semibold">#{row.cheque} <Badge tone={row.chequeStatus === "cleared" ? "ok" : row.chequeStatus === "bounced" ? "danger" : "warn"}>{row.chequeStatus}</Badge></span></div>
          )}
          {pay.notes && <div className="sm:col-span-2 text-mute">{pay.notes}</div>}
        </div>
        <div className="border-t border-line px-6 py-4">
          <h3 className="font-display font-bold text-sm mb-2">Applied to</h3>
          <table className="tbl">
            <thead><tr><th>Document</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {allocs.map((a, i) => (
                <tr key={i}>
                  <td>
                    {a.docType === "sale" && a.saleId ? <Link className="font-semibold hover:text-brand tnum" href={`/sales/${a.saleId}`}>{a.invoiceNo}</Link>
                      : a.docType === "purchase" && a.purchaseId ? <Link className="font-semibold hover:text-brand tnum" href={`/purchases/${a.purchaseId}`}>{a.purchaseNo}</Link>
                      : "—"}
                  </td>
                  <td className="text-mute text-xs uppercase">{a.docType}</td>
                  <td className="num tnum font-bold">{money(a.amount)}</td>
                  <td>{a.status === "final" ? <Badge tone="ok">applied</Badge> : <Badge tone="danger">reversed</Badge>}</td>
                </tr>
              ))}
              {allocs.length === 0 && <tr><td colSpan="4" className="text-mute text-center py-4 text-xs">Advance — not applied to any invoice (held on the account).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
