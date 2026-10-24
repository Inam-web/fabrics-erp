import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, collectionSchedules, accounts, salesmen, sales } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import { getPartyLedger } from "@/server/services.mjs";
import { redirect, notFound } from "next/navigation";
import { todayStr } from "@/server/util.mjs";
import { money, num, dateShort, daysBetween } from "@/lib/format";
import { Card, Badge } from "@/components/ui";
import LedgerView from "@/components/LedgerView";
import CustomerActions from "./_client";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const { id } = await params;
  const custId = Number(id);

  const [customer] = await db.select().from(customers).where(and(eq(customers.id, custId), eq(customers.businessId, user.businessId))).limit(1);
  if (!customer) notFound();

  const { rows } = await getPartyLedger(user.businessId, "customer", custId);
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, user.businessId));
  const sm = await db.select().from(salesmen).where(eq(salesmen.businessId, user.businessId));
  const schedules = await db.select().from(collectionSchedules).where(eq(collectionSchedules.customerId, custId)).orderBy(collectionSchedules.weekStart);
  const openInvoices = await db.select({ id: sales.id, no: sales.invoiceNo, date: sales.date, total: sales.total, paid: sql`(${sales.total}::numeric - ${sales.balance}::numeric)`, balance: sales.balance })
    .from(sales).where(and(eq(sales.customerId, custId), eq(sales.status, "final"), sql`${sales.balance}::numeric > 0`)).orderBy(sales.date);
  const [agg] = await db.select({
    totalSales: sql`COALESCE(SUM(${sales.total}::numeric),0)`, bills: sql`COUNT(*)`,
    lastSale: sql`MAX(${sales.date})`,
  }).from(sales).where(and(eq(sales.customerId, custId), eq(sales.status, "final")));

  const totalDebit = rows.reduce((a, r) => a + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((a, r) => a + Number(r.credit || 0), 0);
  const balance = Number(customer.balance);
  const limit = Number(customer.creditLimit);
  const available = limit > 0 ? limit - balance : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-xs font-bold text-mute hover:text-brand no-print">← All customers</Link>
          <h1 className="font-display text-xl font-bold flex items-center gap-2">
            {customer.name}
            <Badge tone={customer.category === "vip" ? "accent" : "mute"}>{customer.category}</Badge>
            {customer.status !== "active" && <Badge tone="danger">{customer.status}</Badge>}
          </h1>
          <div className="text-sm text-mute mt-0.5">
            {customer.ownerName && <span>{customer.ownerName} · </span>}
            {customer.area && <span>{customer.area}, {customer.city} · </span>}
            {customer.phone && <span className="tnum">{customer.phone}</span>}
            <span className="ml-2 text-xs">{customer.code} · terms: {customer.paymentTerms}{Number(customer.weeklyOgrai) > 0 ? ` · weekly ograi ${money(customer.weeklyOgrai)}` : ""}</span>
          </div>
        </div>
        <div className={`rounded-lg px-4 py-2 text-right border ${balance > 0 ? "bg-danger-soft border-danger/25" : "bg-ok-soft border-ok/25"}`}>
          <div className="text-[0.65rem] uppercase tracking-widest font-bold text-mute">Khata balance</div>
          <div className={`tnum text-2xl font-bold ${balance > 0 ? "text-danger" : "text-ok"}`}>{money(balance)}</div>
          {balance <= 0 && <div className="text-[0.65rem] text-mute">advance / clear</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Total Sales</div><div className="tnum font-bold">{money(agg.totalSales)}</div><div className="text-[0.65rem] text-mute">{agg.bills} bills</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Total Debits</div><div className="tnum font-bold">{money(totalDebit)}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Total Received</div><div className="tnum font-bold">{money(totalCredit)}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Credit Limit</div><div className="tnum font-bold">{limit ? money(limit) : "—"}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Available Credit</div><div className={`tnum font-bold ${available != null && available < 0 ? "text-danger" : ""}`}>{available != null ? money(available) : "Unlimited"}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Last Sale</div><div className="font-bold text-sm">{agg.lastSale ? dateShort(agg.lastSale) : "—"}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Salesman</div><div className="font-bold text-sm truncate">{sm.find((x) => x.id === customer.salesmanId)?.name || "—"}</div></Card>
      </div>

      <CustomerActions customer={customer} accounts={accs} salesmen={sm} schedules={schedules}
        canEmi={["owner", "manager", "accountant"].includes(user.role)} />

      {openInvoices.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-sm">{t("Outstanding documents")}</h2>
            <span className="text-xs text-mute tnum">{openInvoices.length} {t("open")} · {money(openInvoices.reduce((a, x) => a + Number(x.balance), 0))}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Date")}</th><th>{t("Invoice")}</th><th className="num">{t("Total")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Remaining")}</th><th className="num">{t("Age (days)")}</th><th></th></tr></thead>
              <tbody>
                {openInvoices.map((o) => (
                  <tr key={o.id}>
                    <td className="text-mute whitespace-nowrap">{dateShort(o.date)}</td>
                    <td className="tnum font-semibold">{o.no}</td>
                    <td className="num tnum">{money(o.total)}</td>
                    <td className="num tnum text-ok">{money(o.paid)}</td>
                    <td className="num tnum font-bold text-warn">{money(o.balance)}</td>
                    <td className="num tnum">{daysBetween(o.date, todayStr())}</td>
                    <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={`/sales/${o.id}`}>{t("Open")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h2 className="font-display font-bold text-sm mb-2">Customer Ledger — {customer.code}</h2>
        <LedgerView rows={rows} party={customer} kind="customer" whatsappPhone={customer.whatsapp || customer.phone}
          exportHref={`/api/export?type=ledger&kind=customer&id=${customer.id}`} />
      </div>
    </div>
  );
}
