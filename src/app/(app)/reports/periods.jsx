import Link from "next/link";
import { money, compact, dateShort, dateFmt, qtyFmt } from "@/lib/format";
import { Card, Badge } from "@/components/ui";
import { seriesFor, rangeReport } from "@/server/reports.mjs";
import { todayStr, weekMonday, addDays, n0 } from "@/server/util.mjs";
import { makeT } from "@/lib/i18n";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekLabel = (k) => `Week of ${dateFmt(k)}`;
const monthLabel = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
const yearLabel = (k) => k.slice(0, 4);

function rangeOf(kind, key) {
  if (kind === "weekly") return { from: key, to: addDays(key, 6) };
  if (kind === "monthly") {
    const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: key, to: last };
  }
  const y = key.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
const labelOf = { weekly: weekLabel, monthly: monthLabel, yearly: yearLabel };
const paramOf = { weekly: "week", monthly: "month", yearly: "year" };
const subgrainOf = { weekly: "day", monthly: "week", yearly: "month" };
const subLabel = { day: (k) => dateShort(k), week: weekLabel, month: monthLabel };

function Kpis({ k }) {
  const cards = [
    ["Invoices (orders)", String(k.invoices)], ["Sales revenue", money(k.sales)],
    ["Cash sales", money(k.cashSales)], ["Credit sales", money(k.creditSales)],
    ["Avg invoice", money(k.avgInvoice)], ["Purchases", money(k.purchases)],
    ["Collections (ograi)", money(k.collections), "ok"], ["Supplier payments", money(k.supPayments)],
    ["Expenses", money(k.expenses), "warn"], ["Sales returns", `${money(k.returns)} (${k.returnCount || 0})`],
    ["Voided (errors)", String(k.voids), k.voids ? "danger" : "ok"], ["Gross profit", money(k.gp), "ok"],
    ["New customers", String(k.newCustomers)], ["Active customers", String(k.activeCustomers)],
    ["Wholesale revenue", `${money(k.wholesaleRevenue ?? 0)} (${k.wholesaleOrders ?? 0})`], ["Retail revenue", `${money(k.retailRevenue ?? 0)} (${k.retailOrders ?? 0})`],
    ["Ograi target", k.collectionRate == null ? "—" : `${money(k.ograiCollected)} / ${money(k.ograiExpected)} (${k.collectionRate}%)`],
    ["Net cash movement", money(k.netPosition), k.netPosition >= 0 ? "ok" : "danger"],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
      {cards.map(([l, v, tone]) => (
        <Card key={l} pad={false} className="px-3 py-2.5">
          <div className="text-[0.62rem] uppercase tracking-wider font-bold text-mute">{l}</div>
          <div className={`tnum font-bold mt-0.5 ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : ""}`}>{v}</div>
        </Card>
      ))}
    </div>
  );
}

function BreakdownTable({ rows, grain }) {
  const lab = subLabel[grain];
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <table className="tbl">
        <thead><tr>
          <th>{grain === "day" ? t("Date") : grain === "week" ? t("Week") : t("Monthly")}</th>
          <th className="num">{t("Invoices")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Cash")}</th>
          <th className="num">{t("Purchases")}</th><th className="num">{t("Collections")}</th><th className="num">{t("Expenses")}</th>
          <th className="num">{t("Returns")}</th><th className="num">{t("Gross profit")}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td className="font-semibold whitespace-nowrap">{lab(r.k)}</td>
              <td className="num tnum">{r.invoices || "—"}</td>
              <td className="num tnum font-bold">{r.sales ? money(r.sales) : "—"}</td>
              <td className="num tnum">{r.cashSales ? money(r.cashSales) : "—"}</td>
              <td className="num tnum">{r.purchases ? money(r.purchases) : "—"}</td>
              <td className="num tnum text-ok">{r.collections ? money(r.collections) : "—"}</td>
              <td className="num tnum text-warn">{r.expenses ? money(r.expenses) : "—"}</td>
              <td className="num tnum">{r.returns ? money(r.returns) : "—"}</td>
              <td className={`num tnum font-bold ${r.gp < 0 ? "text-danger" : ""}`}>{r.gp ? money(r.gp) : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="9" className="text-center text-mute py-8">No activity in this period.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Lists({ d }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <h4 className="font-display font-bold text-sm mb-2">{t("Top products")}</h4>
        <table className="tbl">
          <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Revenue</th><th className="num">Profit</th></tr></thead>
          <tbody>
            {d.topProducts.map((t, i) => (
              <tr key={i}><td className="font-semibold">{t.name}{t.color ? ` · ${t.color}` : ""}</td><td className="num tnum">{qtyFmt(t.qty)}</td><td className="num tnum">{money(t.revenue)}</td><td className="num tnum font-bold">{money(t.profit)}</td></tr>
            ))}
            {d.topProducts.length === 0 && <tr><td colSpan="4" className="text-mute text-center py-4">No sales.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h4 className="font-display font-bold text-sm mb-2">{t("Top customers")}</h4>
        <table className="tbl">
          <thead><tr><th>Customer</th><th className="num">Bills</th><th className="num">Revenue</th></tr></thead>
          <tbody>
            {d.topCustomers.map((t, i) => (
              <tr key={i}><td className="font-semibold">{t.name}</td><td className="num tnum">{String(t.count)}</td><td className="num tnum font-bold">{money(t.total)}</td></tr>
            ))}
            {d.topCustomers.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">No sales.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h4 className="font-display font-bold text-sm mb-2">{t("Payment methods (receipts)")}</h4>
        <table className="tbl">
          <thead><tr><th>Method</th><th className="num">Receipts</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {d.methods.map((m, i) => (
              <tr key={i}><td className="font-semibold capitalize">{m.method}</td><td className="num tnum">{String(m.n)}</td><td className="num tnum font-bold">{money(m.v)}</td></tr>
            ))}
            {d.methods.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">No receipts.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card>
        <h4 className="font-display font-bold text-sm mb-2">{t("Expenses by category")}</h4>
        <table className="tbl">
          <thead><tr><th>Category</th><th className="num">Entries</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {d.cats.map((m, i) => (
              <tr key={i}><td className="font-semibold">{m.name}</td><td className="num tnum">{String(m.n)}</td><td className="num tnum font-bold text-warn">{money(m.v)}</td></tr>
            ))}
            {d.cats.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">No expenses.</td></tr>}
          </tbody>
        </table>
      </Card>
      <Card className="lg:col-span-2">
        <h4 className="font-display font-bold text-sm mb-2">{t("Salesmen performance")}</h4>
        <table className="tbl">
          <thead><tr><th>Salesman</th><th className="num">Sales</th><th className="num">Collections</th><th className="num">Commission</th></tr></thead>
          <tbody>
            {d.salesmen.filter((x) => n0(x.sales) > 0 || n0(x.collections) > 0).map((m) => (
              <tr key={m.id}><td className="font-semibold">{m.name}</td><td className="num tnum">{money(m.sales)}</td><td className="num tnum text-ok">{money(m.collections)}</td><td className="num tnum font-bold">{money(m.commission)}</td></tr>
            ))}
            {d.salesmen.every((x) => !n0(x.sales) && !n0(x.collections)) && <tr><td colSpan="4" className="text-mute text-center py-4">No salesman activity.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default async function PeriodsSection({ kind, user, sp, t }) {
  if (!t) t = makeT("en");
  const param = paramOf[kind];
  const label = labelOf[kind];
  const today = todayStr();
  const currentKey = kind === "weekly" ? weekMonday(today) : kind === "monthly" ? today.slice(0, 8) + "01" : today.slice(0, 4) + "-01-01";
  const openKey = sp[param];

  if (openKey) {
    const { from, to } = rangeOf(kind, openKey);
    const d = await rangeReport(user.businessId, from, to, subgrainOf[kind]);
    const prevKey = kind === "weekly" ? addDays(openKey, -7) : kind === "monthly"
      ? (new Date(Date.UTC(Number(openKey.slice(0, 4)), Number(openKey.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10))
      : `${Number(openKey.slice(0, 4)) - 1}-01-01`;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/reports?tab=${kind}`} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-brand no-print">← {t("All invoices")}</Link>
          <h3 className="font-display text-lg font-bold">{label(openKey)}</h3>
          <span className="text-xs text-mute tnum">{dateFmt(from)} → {dateFmt(to)}</span>
          <div className="ml-auto flex gap-2 no-print">
            <Link href={`/reports?tab=${kind}&${param}=${prevKey}`} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-brand">← Previous</Link>
            <Link href={`/reports?tab=${kind}&${param}=${currentKey}`} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-brand">Current</Link>
          </div>
        </div>
        <Kpis k={d.kpis} />
        <div>
          <h4 className="font-display font-bold text-sm mb-2">{kind === "weekly" ? t("Day-by-day breakdown") : kind === "monthly" ? t("Week-by-week breakdown") : t("Month-by-month breakdown")}</h4>
          <BreakdownTable rows={[...d.breakdown].reverse()} grain={subgrainOf[kind]} />
        </div>
        <Lists d={d} />
      </div>
    );
  }

  // index of every period
  const series = await seriesFor(user.businessId, subgrainOf[kind] === "day" ? "week" : kind === "monthly" ? "month" : "year");
  const seen = new Set(series.map((r) => r.k));
  if (!seen.has(currentKey)) series.unshift({ k: currentKey, invoices: 0, sales: 0, cashSales: 0, purchases: 0, collections: 0, expenses: 0, returns: 0, gp: 0 });
  return (
    <div className="space-y-3">
      <div className="text-sm text-mute">Every {kind.replace("ly", "")} since your first transaction — open any row for the full detail report.</div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr>
            <th>{t("Date")}</th><th className="num">{t("Invoices")}</th><th className="num">{t("Sales")}</th><th className="num">{t("Cash")}</th>
            <th className="num">{t("Purchases")}</th><th className="num">{t("Collections")}</th><th className="num">{t("Expenses")}</th>
            <th className="num">{t("Returns")}</th><th className="num">{t("Gross profit")}</th><th></th>
          </tr></thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.k} className={r.k === currentKey ? "bg-brand-soft/50" : ""}>
                <td className="font-semibold whitespace-nowrap">{label(r.k)}{r.k === currentKey && <Badge tone="brand"> current</Badge>}</td>
                <td className="num tnum">{r.invoices || "—"}</td>
                <td className="num tnum font-bold">{r.sales ? money(r.sales) : "—"}</td>
                <td className="num tnum">{r.cashSales ? money(r.cashSales) : "—"}</td>
                <td className="num tnum">{r.purchases ? money(r.purchases) : "—"}</td>
                <td className="num tnum text-ok">{r.collections ? money(r.collections) : "—"}</td>
                <td className="num tnum text-warn">{r.expenses ? money(r.expenses) : "—"}</td>
                <td className="num tnum">{r.returns ? money(r.returns) : "—"}</td>
                <td className={`num tnum font-bold ${r.gp < 0 ? "text-danger" : ""}`}>{r.gp ? money(r.gp) : "—"}</td>
                <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={`/reports?tab=${kind}&${param}=${r.k}`}>{t("Open →")}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
