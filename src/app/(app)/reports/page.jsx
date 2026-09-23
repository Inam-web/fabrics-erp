import Link from "next/link";
import { cookies } from "next/headers";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { dayClosings, users, sales, salesmen, customers, suppliers, payments, purchases, expenses, expenseCategories, accounts } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { profitLoss, receivablesReport, payablesReport, dailyStats, weeklyComparison, salesmanPerformance, topProducts } from "@/server/services.mjs";
import { todayStr, addDays, weekMonday, n0 } from "@/server/util.mjs";
import { money, compact, dateShort, dateFmt } from "@/lib/format";
import { Tabs, Card, Badge, PrintButton } from "@/components/ui";
import { CloseDayButton } from "./_client";
import PeriodsSection from "./periods";
import { getLang, makeT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pl", label: "Profit & Loss" },
  { key: "gst", label: "GST Summary" },
  { key: "receivables", label: "Receivables" },
  { key: "payables", label: "Payables" },
  { key: "daily", label: "Daily Closing" },
  { key: "daybook", label: "Day Book" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
  { key: "salesmen", label: "Salesmen & Commission" },
];

function Delta({ cur, prev }) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return <span className={`ml-1.5 text-[0.66rem] font-bold ${pct >= 0 ? "text-ok" : "text-danger"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}

export default async function ReportsPage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const t = makeT(getLang((await cookies()).toString()).code);
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab : "pl";
  const b = user.businessId;
  const today = todayStr();
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;

  let body = null;

  if (tab === "pl") {
    const pl = await profitLoss(b, from, to);
    const top = await topProducts(b, from, to, 10);
    body = (
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-display font-bold text-sm mb-3">Income statement · {dateShort(from)} → {dateShort(to)}</h3>
          <table className="tbl">
            <tbody>
              {[
                ["Gross sales", pl.grossSales, false],
                ["Sales returns", -pl.returns, false],
                ["Net sales", pl.netSales, true],
                ["Cost of goods sold", -pl.cogs, false],
                ["Gross profit", pl.grossProfit, true],
                ...pl.expenses.map((e) => [`Expense — ${e.name}`, -e.total, false]),
                ["Total expenses", -pl.totalExpenses, true],
                ["NET PROFIT", pl.netProfit, "net"],
              ].map(([label, val, strong], i) => (
                <tr key={i} className={strong === "net" ? "border-t-2 border-ink" : strong ? "font-bold" : ""}>
                  <td className={strong ? "font-bold" : ""}>{label}</td>
                  <td className={`num tnum ${strong === "net" ? `font-bold text-base ${val >= 0 ? "text-ok" : "text-danger"}` : strong ? "font-bold" : ""}`}>{money(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2 no-print">
            <Link className="text-xs font-bold text-brand hover:underline" href={`/reports?tab=pl&from=${weekMonday(addDays(today, -7))}&to=${addDays(today, -1)}`}>Last week</Link>
            <Link className="text-xs font-bold text-brand hover:underline" href={`/reports?tab=pl&from=${today.slice(0, 8)}01&to=${today}`}>This month</Link>
            <Link className="text-xs font-bold text-brand hover:underline" href={`/reports?tab=pl&from=${today.slice(0, 4)}-01-01&to=${today}`}>This year</Link>
          </div>
        </Card>
        <Card>
          <h3 className="font-display font-bold text-sm mb-3">Margin by fabric (period)</h3>
          <table className="tbl">
            <thead><tr><th>Fabric</th><th className="num">Qty</th><th className="num">Revenue</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
            <tbody>
              {top.map((t, i) => {
                const rev = n0(t.revenue), prof = n0(t.profit);
                return (
                  <tr key={i}>
                    <td className="font-semibold">{t.name}{t.color ? ` · ${t.color}` : ""}</td>
                    <td className="num tnum">{Number(t.qty).toLocaleString()}</td>
                    <td className="num tnum">{compact(rev)}</td>
                    <td className="num tnum font-bold">{compact(prof)}</td>
                    <td className="num tnum">{rev ? Math.round(prof / rev * 100) : 0}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  if (tab === "receivables") {
    const rows = await receivablesReport(b);
    const total = rows.reduce((a, r) => a + r.balance, 0);
    const buckets = ["b30", "b60", "b90", "b120", "bPlus"];
    const labels = ["0–30 days", "31–60", "61–90", "91–120", "120+"];
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
          <Card pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">Total receivable</div><div className="tnum font-bold text-lg text-danger">{money(total)}</div></Card>
          {buckets.map((k, i) => (
            <Card key={k} pad={false} className="px-3 py-2.5">
              <div className="text-[0.63rem] uppercase font-bold text-mute">{labels[i]}</div>
              <div className="tnum font-bold">{money(rows.reduce((a, r) => a + r.buckets[k], 0))}</div>
            </Card>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Area</th><th>Salesman</th><th className="num">Balance</th><th className="num">Overdue ograi</th><th className="num">Age</th><th className="num">Credit limit</th><th className="num">Available</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/customers/${r.id}`} className="font-semibold hover:text-brand">{r.name}</Link></td>
                  <td className="text-xs text-mute">{r.area || "—"}</td>
                  <td className="text-xs">{r.salesman || "—"}</td>
                  <td className="num tnum font-bold">{money(r.balance)}</td>
                  <td className="num tnum">{r.overdueOgrai ? <Badge tone="danger">{money(r.overdueOgrai)}</Badge> : "—"}</td>
                  <td className="num tnum">{r.ageDays}d</td>
                  <td className="num tnum text-mute">{r.creditLimit ? money(r.creditLimit) : "—"}</td>
                  <td className={`num tnum ${r.available < 0 ? "text-danger font-bold" : ""}`}>{r.creditLimit ? money(r.available) : "∞"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === "payables") {
    const rows = await payablesReport(b);
    body = (
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>Supplier</th><th>City</th><th>Type</th><th className="num">We owe</th><th className="num">Share</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const totalAll = rows.reduce((a, x) => a + x.balance, 0) || 1;
              return (
                <tr key={r.id}>
                  <td><Link href={`/suppliers/${r.id}`} className="font-semibold hover:text-brand">{r.name}</Link></td>
                  <td className="text-xs text-mute">{r.city || "—"}</td>
                  <td className="text-xs">{r.category}</td>
                  <td className="num tnum font-bold">{money(r.balance)}</td>
                  <td className="num tnum text-mute">{Math.round(r.balance / totalAll * 100)}%</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">No supplier payables. Everything is settled.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  if (tab === "daily") {
    const date = sp.date || today;
    const st = await dailyStats(db, b, date);
    const closings = await db.select({ closing: dayClosings, closer: users.name }).from(dayClosings)
      .leftJoin(users, eq(users.id, dayClosings.closedBy))
      .where(eq(dayClosings.businessId, b)).orderBy(dayClosings.date).limit(500);
    const todayClosing = closings.find((c) => c.closing.date === date);
    body = (
      <div className="space-y-4">
        <form method="GET" className="flex items-end gap-2 no-print">
          <input type="hidden" name="tab" value="daily" />
          <div>
            <label className="text-[0.65rem] font-bold uppercase text-mute">Date</label>
            <input type="date" name="date" defaultValue={date} className="inp mt-0.5" />
          </div>
          <button className="rounded-md bg-brand text-white text-sm font-semibold px-4 py-2">Load</button>
          <div className="ml-auto"><CloseDayButton date={date} expectedCash={st.expectedCash} alreadyClosed={!!todayClosing} /></div>
        </form>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {[
            ["Total sales", st.salesTotal], ["Cash sales", st.cashSales], ["Credit sales", st.creditSales],
            ["Collections (ograi)", st.collections], ["Supplier payments", st.supplierPayments],
            ["Purchases", st.purchases], ["Expenses", st.expenses], ["Sales returns", st.returns],
          ].map(([l, v]) => (
            <Card key={l} pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{l}</div><div className="tnum font-bold">{money(v)}</div></Card>
          ))}
          <Card pad={false} className="px-3 py-2.5 bg-night text-white border-night">
            <div className="text-[0.63rem] uppercase font-bold text-night-text">Expected cash closing</div>
            <div className="tnum font-bold text-white">{money(st.expectedCash)}</div>
            {todayClosing && <div className="text-[0.65rem] text-night-text mt-1">Counted {money(todayClosing.closing.actualCash)} · diff {money(todayClosing.closing.difference)}</div>}
          </Card>
        </div>
        {closings.length > 0 && (
          <Card>
            <h3 className="font-display font-bold text-sm mb-2">Closing history</h3>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Closed by</th><th className="num">Expected</th><th className="num">Actual</th><th className="num">Difference</th><th>Notes</th></tr></thead>
              <tbody>
                {[...closings].reverse().slice(0, 14).map((c) => (
                  <tr key={c.closing.id}>
                    <td className="font-semibold">{dateShort(c.closing.date)}</td>
                    <td className="text-xs">{c.closer || "—"}</td>
                    <td className="num tnum">{money(c.closing.expectedCash)}</td>
                    <td className="num tnum">{money(c.closing.actualCash)}</td>
                    <td className={`num tnum font-bold ${Number(c.closing.difference) === 0 ? "text-ok" : "text-danger"}`}>{money(c.closing.difference)}</td>
                    <td className="text-xs text-mute">{c.closing.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    );
  }

  if (tab === "weekly" || tab === "monthly" || tab === "yearly") {
    body = <PeriodsSection kind={tab} user={user} sp={sp} t={t} />;
  }

  if (tab === "gst") {
    const gstRows = await db.select({
      gstMode: sales.gstMode, n: sql`COUNT(*)`, taxable: sql`COALESCE(SUM(${sales.subtotal}::numeric - ${sales.discount}::numeric),0)`, gst: sql`COALESCE(SUM(${sales.tax}::numeric),0)`,
    }).from(sales).where(and(eq(sales.businessId, b), eq(sales.status, "final"), gte(sales.date, from), lte(sales.date, to), sql`${sales.tax}::numeric > 0`))
      .groupBy(sales.gstMode);
    const totTaxable = gstRows.reduce((a, r) => a + Number(r.taxable), 0);
    const totGst = gstRows.reduce((a, r) => a + Number(r.gst), 0);
    const intra = gstRows.find((r) => r.gstMode === "intra");
    const inter = gstRows.find((r) => r.gstMode === "inter");
    body = (
      <div className="space-y-4">
        <div className="flex justify-end no-print">
          <Link href={`/api/export?type=gst&from=${from}&to=${to}`} className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">⬇ Export GST data (for filing)</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {[["Taxable sales", totTaxable], ["Total GST collected", totGst],
            ["CGST", Number(intra?.gst || 0) / 2], ["SGST", Number(intra?.gst || 0) / 2], ["IGST", Number(inter?.gst || 0)]].map(([l, v]) => (
            <Card key={l} pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{l}</div><div className="tnum font-bold text-lg">{money(v)}</div></Card>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>GST type</th><th className="num">Invoices</th><th className="num">Taxable value</th><th className="num">GST amount</th></tr></thead>
            <tbody>
              {gstRows.map((r) => (
                <tr key={r.gstMode}>
                  <td className="font-semibold">{r.gstMode === "intra" ? "CGST + SGST (intra-province)" : r.gstMode === "inter" ? "IGST (inter-province)" : r.gstMode}</td>
                  <td className="num tnum">{String(r.n)}</td>
                  <td className="num tnum">{money(r.taxable)}</td>
                  <td className="num tnum font-bold">{money(r.gst)}</td>
                </tr>
              ))}
              {gstRows.length === 0 && <tr><td colSpan="4" className="text-center text-mute py-8">No GST invoices in this period. Select GST mode while billing to charge per-item GST.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-mute">GST is computed per item from the fabric's GST % in the product master, server-side. Rates are set in Inventory → New Fabric.</div>
      </div>
    );
  }

  if (tab === "daybook") {
    const date = sp.date || today;
    const [dSales, dPays, dPurs, dExps] = await Promise.all([
      db.select({ at: sales.createdAt, desc: sales.invoiceNo, party: customers.name, kind: sql`'Sale'`, amount: sales.total }).from(sales).innerJoin(customers, eq(customers.id, sales.customerId)).where(and(eq(sales.businessId, b), eq(sales.date, date), eq(sales.status, "final"))),
      db.select({ at: payments.createdAt, desc: payments.receiptNo, party: payments.partyType === "supplier" ? suppliers.name : customers.name, kind: payments.partyType === "customer" ? sql`'Receipt'` : sql`'Supplier payment'`, amount: payments.amount }).from(payments).leftJoin(customers, and(eq(customers.id, payments.partyId), eq(payments.partyType, "customer"))).leftJoin(suppliers, and(eq(suppliers.id, payments.partyId), eq(payments.partyType, "supplier"))).where(and(eq(payments.businessId, b), eq(payments.date, date), eq(payments.status, "final"))),
      db.select({ at: purchases.createdAt, desc: purchases.purchaseNo, party: suppliers.name, kind: sql`'Purchase'`, amount: purchases.total }).from(purchases).innerJoin(suppliers, eq(suppliers.id, purchases.supplierId)).where(and(eq(purchases.businessId, b), eq(purchases.date, date), eq(purchases.status, "final"))),
      db.select({ at: expenses.createdAt, desc: expenseCategories.name, party: expenses.description, kind: sql`'Expense'`, amount: expenses.amount }).from(expenses).innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId)).where(and(eq(expenses.businessId, b), eq(expenses.date, date))),
    ]);
    const all = [...dSales, ...dPays, ...dPurs, ...dExps].sort((a, x) => new Date(a.at) - new Date(x.at));
    body = (
      <div className="space-y-3">
        <form method="GET" className="flex items-end gap-2 no-print">
          <input type="hidden" name="tab" value="daybook" />
          <div><label className="text-[0.65rem] font-bold uppercase text-mute">Date</label><input type="date" name="date" defaultValue={date} className="inp mt-0.5" /></div>
          <button className="rounded-md bg-brand text-white text-sm font-semibold px-4 py-2">Load</button>
        </form>
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Type</th><th>Document</th><th>Party / detail</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {all.map((r, i) => (
                <tr key={i}>
                  <td className="text-mute text-xs">{new Date(r.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className="font-semibold">{r.kind}</span></td>
                  <td className="tnum text-xs">{r.desc}</td>
                  <td className="text-xs">{r.party || "—"}</td>
                  <td className="num tnum font-bold">{money(r.amount)}</td>
                </tr>
              ))}
              {all.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">No transactions on this date.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === "salesmen") {
    const rows = await salesmanPerformance(b, from, to);
    body = (
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>Salesman</th><th>Commission rule</th><th className="num">Sales ({dateShort(from)}→{dateShort(to)})</th><th className="num">Collections</th><th className="num">Commission earned</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.name}<div className="text-[0.66rem] text-mute">{r.phone}</div></td>
                <td className="text-xs">{r.commissionType === "none" ? "—" : `${r.commissionRate}% of ${r.commissionType === "percent_sales" ? "sales" : "collections"}`}</td>
                <td className="num tnum">{money(r.sales)}</td>
                <td className="num tnum">{money(r.collections)}</td>
                <td className="num tnum font-bold text-brand-deep">{money(r.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Reports")}</h1>
          <div className="text-sm text-mute">Computed live from the transaction books — never from cached totals.</div>
        </div>
        <div className="flex gap-2 no-print">
          <PrintButton label="🖨 Print" size="md" />
          <Link href={`/api/export?type=sales&from=${from}&to=${to}`} className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">Sales CSV</Link>
          <Link href="/api/export?type=payments" className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">Payments CSV</Link>
        </div>
      </div>
      <Tabs tabs={TABS.map((x) => ({ key: x.key, label: t(x.label) }))} active={tab} base="/reports" />
      {(tab === "pl" || tab === "salesmen" || tab === "gst") && (
        <form method="GET" className="flex items-end gap-2 no-print">
          <input type="hidden" name="tab" value={tab} />
          <div><label className="text-[0.65rem] font-bold uppercase text-mute">From</label><input type="date" name="from" defaultValue={from} className="inp mt-0.5" /></div>
          <div><label className="text-[0.65rem] font-bold uppercase text-mute">To</label><input type="date" name="to" defaultValue={to} className="inp mt-0.5" /></div>
          <button className="rounded-md bg-brand text-white text-sm font-semibold px-4 py-2">Apply</button>
        </form>
      )}
      {body}
    </div>
  );
}
