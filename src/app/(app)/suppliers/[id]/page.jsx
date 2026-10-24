import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, accounts, purchases } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { getPartyLedger } from "@/server/services.mjs";
import { redirect, notFound } from "next/navigation";
import { todayStr } from "@/server/util.mjs";
import { money, dateShort, daysBetween } from "@/lib/format";
import { Card } from "@/components/ui";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import LedgerView from "@/components/LedgerView";
import { SupplierActions } from "../_client";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const { id } = await params;
  const sid = Number(id);
  const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.id, sid), eq(suppliers.businessId, user.businessId))).limit(1);
  if (!supplier) notFound();
  const { rows } = await getPartyLedger(user.businessId, "supplier", sid);
  const openBills = await db.select({ id: purchases.id, no: purchases.purchaseNo, date: purchases.date, total: purchases.total, paid: sql`(${purchases.total}::numeric - ${purchases.balance}::numeric)`, balance: purchases.balance })
    .from(purchases).where(and(eq(purchases.supplierId, sid), eq(purchases.status, "final"), sql`${purchases.balance}::numeric > 0`)).orderBy(purchases.date);
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, user.businessId));
  const [agg] = await db.select({
    total: sql`COALESCE(SUM(${purchases.total}::numeric),0)`, n: sql`COUNT(*)`, last: sql`MAX(${purchases.date})`,
    unpaid: sql`COALESCE(SUM(${purchases.balance}::numeric),0)`,
  }).from(purchases).where(and(eq(purchases.supplierId, sid), eq(purchases.status, "final")));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/suppliers" className="text-xs font-bold text-mute hover:text-brand no-print">← All suppliers</Link>
          <h1 className="font-display text-xl font-bold">{supplier.name}</h1>
          <div className="text-sm text-mute">{supplier.contactPerson} · {supplier.city} · <span className="tnum">{supplier.phone}</span> · {supplier.code} · terms {supplier.paymentTerms}</div>
        </div>
        <div className={`rounded-lg px-4 py-2 text-right border ${Number(supplier.balance) > 0 ? "bg-warn-soft border-accent/25" : "bg-ok-soft border-ok/25"}`}>
          <div className="text-[0.65rem] uppercase tracking-widest font-bold text-mute">We owe</div>
          <div className="tnum text-2xl font-bold">{money(supplier.balance)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Total Purchases</div><div className="tnum font-bold">{money(agg.total)}</div><div className="text-[0.65rem] text-mute">{agg.n} bills</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Unpaid on bills</div><div className="tnum font-bold">{money(agg.unpaid)}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Last purchase</div><div className="font-bold text-sm">{agg.last ? dateShort(agg.last) : "—"}</div></Card>
        <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Category</div><div className="font-bold text-sm capitalize">{supplier.category}</div></Card>
      </div>

      <SupplierActions supplier={supplier} accounts={accs} />

      {openBills.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-sm">{t("Outstanding documents")}</h2>
            <span className="text-xs text-mute tnum">{openBills.length} {t("open")} · {money(openBills.reduce((a, x) => a + Number(x.balance), 0))}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>{t("Date")}</th><th>{t("Purchases")}</th><th className="num">{t("Total")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Remaining")}</th><th className="num">{t("Age (days)")}</th><th></th></tr></thead>
              <tbody>
                {openBills.map((o) => (
                  <tr key={o.id}>
                    <td className="text-mute whitespace-nowrap">{dateShort(o.date)}</td>
                    <td className="tnum font-semibold">{o.no}</td>
                    <td className="num tnum">{money(o.total)}</td>
                    <td className="num tnum text-ok">{money(o.paid)}</td>
                    <td className="num tnum font-bold text-warn">{money(o.balance)}</td>
                    <td className="num tnum">{daysBetween(o.date, todayStr())}</td>
                    <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={`/purchases/${o.id}`}>{t("Open")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <h2 className="font-display font-bold text-sm mb-2">Supplier Ledger — {supplier.code}</h2>
        <LedgerView rows={rows} party={supplier} kind="supplier" whatsappPhone={supplier.phone}
          exportHref={`/api/export?type=ledger&kind=supplier&id=${supplier.id}`} />
      </div>
    </div>
  );
}
