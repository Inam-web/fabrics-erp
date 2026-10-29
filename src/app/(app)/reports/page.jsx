import Link from "next/link";
import { cookies } from "next/headers";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { dayClosings, users, sales, salesmen, customers, suppliers, payments, purchases, expenses, expenseCategories, accounts, businesses, journalEntries, journalLines } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { profitLoss, receivablesReport, payablesReport, dailyStats, weeklyComparison, salesmanPerformance, topProducts, getPartyLedger } from "@/server/services.mjs";
import { todayStr, addDays, weekMonday, n0, r2 } from "@/server/util.mjs";
import { money, compact, dateShort, dateFmt, daysBetween } from "@/lib/format";
import { Tabs, Card, Badge, PrintButton, EmptyState, AppIcon } from "@/components/ui";
import { CloseDayButton } from "./_client";
import LedgerView from "@/components/LedgerView";
import LedgerPartyFilter from "./_ledgerfilter";
const filtered0 = (rows) => rows.reduce((a, r) => ({ debit: a.debit + Number(r.debit || 0), credit: a.credit + Number(r.credit || 0) }), { debit: 0, credit: 0 });
import PeriodsSection from "./periods";
import { BRAND, brandMark } from "@/lib/brand.mjs";
import { getLang, makeT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "pl", label: "Profit & Loss" },
  { key: "ledger", label: "Ledger" },
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

const CHART = [
  { code: "CASH", name: "Cash in Hand", type: "Asset", side: "debit" },
  { code: "BANK", name: "Bank Accounts", type: "Asset", side: "debit" },
  { code: "AR", name: "Accounts Receivable (Customers)", type: "Asset", side: "debit" },
  { code: "INVENTORY", name: "Inventory (Stock at cost)", type: "Asset", side: "debit" },
  { code: "AP", name: "Accounts Payable (Suppliers)", type: "Liability", side: "credit" },
  { code: "CAPITAL", name: "Owner Capital & Opening", type: "Equity", side: "credit" },
  { code: "SALES", name: "Sales Revenue", type: "Revenue", side: "credit" },
  { code: "SALES_RET", name: "Sales Returns", type: "Contra-Revenue", side: "debit" },
  { code: "PURCHASES", name: "Purchases (Inventory in)", type: "Asset movement", side: "debit" },
  { code: "COGS", name: "Cost of Goods Sold", type: "Expense", side: "debit" },
  { code: "EXPENSE", name: "Operating Expenses", type: "Expense", side: "debit" },
];
const drillHref = (r) =>
  r.refType === "sale" || r.refType === "sale_edit" || r.refType === "void_sale" ? `/sales/${r.refId}`
  : r.refType === "purchase" ? `/purchases/${r.refId}`
  : r.refType === "payment" || r.refType === "payment_reversal" || r.refType === "cheque_reversal" ? `/payments/${r.refId}`
  : r.refType === "expense" ? "/expenses"
  : r.refType === "transfer" ? "/cashbank"
  : r.refType === "sales_return" ? "/sales" : null;

function Delta({ cur, prev }) {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  return <span className={`ml-1.5 text-[0.66rem] font-bold ${pct >= 0 ? "text-ok" : "text-danger"}`}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%</span>;
}


function LedgerSubNav({ view, sp, t }) {
  const base = "/reports?tab=ledger";
  const items = [["party", t("Party Ledgers")], ["account", t("Account Ledger")], ["coa", t("Chart of Accounts")], ["trial", t("Trial Balance")]];
  return (
    <div className="flex gap-1 flex-wrap no-print">
      {items.map(([k, label]) => (
        <Link key={k} href={`${base}&view=${k}${sp.from ? `&from=${sp.from}` : ""}${sp.to ? `&to=${sp.to}` : ""}`}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-bold border transition-colors ${view === k ? "bg-[#12263f] text-white border-[#12263f]" : "bg-white border-line text-mute hover:text-ink hover:border-brand"}`}>
          {label}
        </Link>
      ))}
    </div>
  );
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
                ...(pl.stockLoss ? [["Stock loss / adjustments", -pl.stockLoss, false]] : []),
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
        <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
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
    const total = rows.reduce((a, r) => a + r.balance, 0);
    const buckets = ["b30", "b60", "b90", "b120", "bPlus"];
    const labels = ["0–30 days", "31–60", "61–90", "91–120", "120+"];
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
          <Card pad={false} className="px-3 py-2.5 border-s-4 border-s-warn"><div className="text-[0.63rem] uppercase font-extrabold text-mute">Total payable</div><div className="tnum font-bold text-lg text-warn">{money(total)}</div></Card>
          {buckets.map((k, i) => (
            <Card key={k} pad={false} className="px-3 py-2.5">
              <div className="text-[0.63rem] uppercase font-extrabold text-mute">{labels[i]}</div>
              <div className="tnum font-bold">{money(rows.reduce((a, r) => a + r.buckets[k], 0))}</div>
            </Card>
          ))}
        </div>
        <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>City</th><th>Type</th><th className="num">We owe</th><th className="num">Age</th><th className="num">Share</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const totalAll = total || 1;
                return (
                  <tr key={r.id}>
                    <td><Link href={`/suppliers/${r.id}`} className="font-semibold hover:text-brand">{r.name}</Link></td>
                    <td className="text-xs text-mute">{r.city || "—"}</td>
                    <td className="text-xs">{r.category}</td>
                    <td className="num tnum font-bold text-warn">{money(r.balance)}</td>
                    <td className="num tnum text-mute">{r.ageDays}d</td>
                    <td className="num tnum text-mute">{Math.round(r.balance / totalAll * 100)}%</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan="6" className="text-center text-mute py-8">No supplier payables. Everything is settled.</td></tr>}
            </tbody>
          </table>
        </div>
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
          <Link href={`/api/export?type=gst&from=${from}&to=${to}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand"><AppIcon name="down" /> {t("Export GST data (for filing)")}</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          {[["Taxable sales", totTaxable], ["Total GST collected", totGst],
            ["CGST", Number(intra?.gst || 0) / 2], ["SGST", Number(intra?.gst || 0) / 2], ["IGST", Number(inter?.gst || 0)]].map(([l, v]) => (
            <Card key={l} pad={false} className="px-3 py-2.5"><div className="text-[0.63rem] uppercase font-bold text-mute">{l}</div><div className="tnum font-bold text-lg">{money(v)}</div></Card>
          ))}
        </div>
        <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
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
        <div className="text-xs text-mute">GST is computed per item from the fabric&apos;s GST % in the product master, server-side. Rates are set in Inventory → New Fabric.</div>
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
        <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
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

  if (tab === "ledger") {
    const view = sp.view || "party";
    const from = sp.from || ""; const to = sp.to || "";
    const dateConds = [...(from ? [gte(journalEntries.date, from)] : []), ...(to ? [lte(journalEntries.date, to)] : [])];
    const accs = await db.select().from(accounts).where(eq(accounts.businessId, b));

    if (view === "account" || view === "coa" || view === "trial") {
      const codeSel = sp.code || "CASH";
      const entityId = sp.entity ? Number(sp.entity) : null;
      let lines = [];
      if (view === "account") {
        lines = await db.select({
          date: journalEntries.date, memo: journalEntries.memo, refType: journalEntries.refType, refId: journalEntries.refId,
          debit: journalLines.debit, credit: journalLines.credit, entityId: journalLines.entityId,
        }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
          .where(and(eq(journalEntries.businessId, b), eq(journalLines.accountCode, codeSel),
            ...(entityId ? [eq(journalLines.entityId, entityId)] : []), ...dateConds))
          .orderBy(journalEntries.date, journalEntries.id);
      }
      const sums = await db.select({
        code: journalLines.accountCode, entityId: journalLines.entityId,
        d: sql`COALESCE(SUM(${journalLines.debit}::numeric),0)`, c: sql`COALESCE(SUM(${journalLines.credit}::numeric),0)`,
      }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
        .where(and(eq(journalEntries.businessId, b), ...dateConds))
        .groupBy(journalLines.accountCode, journalLines.entityId);
      const sideOf = (code) => CHART.find((c) => c.code === code)?.side || "debit";
      const openingFor = (code, ent) => {
        if ((code === "CASH" || code === "BANK") && ent) return Number(accs.find((a) => a.id === ent)?.openingBalance || 0);
        if (code === "CAPITAL" && !ent) return -accs.reduce((x, a) => x + Number(a.openingBalance), 0);
        return 0;
      };
      const balOf = (code, ent) => {
        const m = sums.filter((s2) => s2.code === code && (ent ? s2.entityId === ent : true))
          .reduce((x, s2) => ({ d: x.d + Number(s2.d), c: x.c + Number(s2.c) }), { d: 0, c: 0 });
        const run = m.d - m.c;
        return sideOf(code) === "credit" ? -run : run;
      };

      if (view === "trial") {
        const byCode = CHART.map((cDef) => {
          const m = sums.filter((s2) => s2.code === cDef.code).reduce((x, s2) => ({ d: x.d + Number(s2.d), c: x.c + Number(s2.c) }), { d: 0, c: 0 });
          return { ...cDef, d: m.d, c: m.c };
        }).filter((r) => r.d || r.c);
        const td = byCode.reduce((x, r) => x + r.d, 0), tc = byCode.reduce((x, r) => x + r.c, 0);
        body = (
          <div className="space-y-4">
            <LedgerSubNav view="trial" sp={sp} t={t} />
            <Card>
              <h3 className="font-display font-bold text-sm mb-2">{t("Trial Balance")} · {from || "…"} → {to || today}</h3>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                  <tbody>
                    {byCode.map((r) => (
                      <tr key={r.code}>
                        <td className="tnum font-bold">{r.code}</td>
                        <td className="font-semibold">{r.name}</td>
                        <td className="text-xs text-mute">{r.type}</td>
                        <td className="num tnum">{r.d ? money(r.d) : "—"}</td>
                        <td className="num tnum">{r.c ? money(r.c) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan="3" className="font-extrabold">Total</td>
                    <td className="num tnum font-extrabold">{money(td)}</td>
                    <td className="num tnum font-extrabold">{money(tc)}</td></tr></tfoot>
                </table>
              </div>
              <div className={`mt-3 text-sm font-bold ${Math.abs(td - tc) < 0.01 ? "text-ok" : "text-danger"}`}>
                {Math.abs(td - tc) < 0.01 ? "✓ Books are balanced — total debits equal total credits." : `⚠ Out of balance by ${money(td - tc)}`}
              </div>
            </Card>
          </div>
        );
        return body;
      }

      if (view === "coa") {
        body = (
          <div className="space-y-4">
            <LedgerSubNav view="coa" sp={sp} t={t} />
            <Card>
              <h3 className="font-display font-bold text-sm mb-2">{t("Chart of Accounts")}</h3>
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Opening</th><th className="num">Movement (Dr−Cr)</th><th className="num">Balance</th><th></th></tr></thead>
                  <tbody>
                    {CHART.map((cDef) => {
                      if (cDef.code === "CASH" || cDef.code === "BANK") {
                        return accs.filter((a) => a.type === (cDef.code === "CASH" ? "cash" : "bank")).map((a) => {
                          const bal = balOf(cDef.code, a.id);
                          return (
                            <tr key={`${cDef.code}-${a.id}`}>
                              <td className="tnum font-bold">{cDef.code}</td>
                              <td className="font-semibold">{a.name}</td>
                              <td className="text-xs text-mute">{cDef.type}</td>
                              <td className="num tnum">{money(a.openingBalance)}</td>
                              <td className="num tnum">{money(bal - Number(a.openingBalance))}</td>
                              <td className="num tnum font-bold">{money(bal)}</td>
                              <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={`/reports?tab=ledger&view=account&code=${cDef.code}&entity=${a.id}`}>{t("Open ledger")}</Link></td>
                            </tr>
                          );
                        });
                      }
                      const open = openingFor(cDef.code, null);
                      const bal = balOf(cDef.code, null) + (cDef.code === "CAPITAL" ? open : open);
                      return (
                        <tr key={cDef.code}>
                          <td className="tnum font-bold">{cDef.code}</td>
                          <td className="font-semibold">{cDef.name}</td>
                          <td className="text-xs text-mute">{cDef.type}</td>
                          <td className="num tnum">{open ? money(open) : "—"}</td>
                          <td className="num tnum">{money(balOf(cDef.code, null))}</td>
                          <td className="num tnum font-bold">{money(bal)}</td>
                          <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={`/reports?tab=ledger&view=account&code=${cDef.code}`}>{t("Open ledger")}</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
        return body;
      }

      // account ledger
      const def = CHART.find((c) => c.code === codeSel) || CHART[0];
      const open = openingFor(codeSel, entityId);
      const creditSide = sideOf(codeSel) === "credit";
      const rowsOut = lines.reduce((acc, l) => {
        const run = r2(acc.run + Number(l.debit) - Number(l.credit));
        return { run, rows: [...acc.rows, { ...l, debit: Number(l.debit), credit: Number(l.credit), balance: creditSide ? -run : run }] };
      }, { run: open, rows: [] }).rows;
      body = (
        <div className="space-y-4">
          <LedgerSubNav view="account" sp={sp} t={t} />
          <form method="GET" className="flex flex-wrap items-end gap-3 no-print">
            <input type="hidden" name="tab" value="ledger" />
            <input type="hidden" name="view" value="account" />
            <div>
              <label className="text-[0.65rem] font-bold uppercase text-mute">{t("Account")}</label>
              <select name="code" defaultValue={codeSel} className="inp mt-0.5">
                {CHART.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            {(codeSel === "CASH" || codeSel === "BANK") && (
              <div>
                <label className="text-[0.65rem] font-bold uppercase text-mute">{t("Specific account")}</label>
                <select name="entity" defaultValue={entityId || ""} className="inp mt-0.5">
                  <option value="">{t("All")}</option>
                  {accs.filter((a) => a.type === (codeSel === "CASH" ? "cash" : "bank")).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            <div><label className="text-[0.65rem] font-bold uppercase text-mute">{t("From")}</label><input type="date" name="from" defaultValue={from} className="inp mt-0.5" /></div>
            <div><label className="text-[0.65rem] font-bold uppercase text-mute">{t("To")}</label><input type="date" name="to" defaultValue={to} className="inp mt-0.5" /></div>
            <button className="rounded-lg bg-brand text-white text-sm font-bold px-4 py-2">{t("Filter")}</button>
            <a className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand no-print"
              href={`/api/export?type=accountledger&code=${codeSel}${entityId ? `&entity=${entityId}` : ""}&from=${from}&to=${to}`}>Export CSV</a>
          </form>
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-sm">{def.code} — {def.name}{entityId ? ` · ${accs.find((a) => a.id === entityId)?.name || ""}` : ""}</h3>
              <span className="text-xs text-mute">{def.type} · {def.side === "credit" ? "credit-normal" : "debit-normal"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>{t("Date")}</th><th>{t("Description")}</th><th>{t("Reference")}</th><th className="num">{t("Debit")}</th><th className="num">{t("Credit")}</th><th className="num">{t("Balance")}</th></tr></thead>
                <tbody>
                  <tr className="bg-[#f6f8f6]"><td className="text-mute">—</td><td className="font-semibold">{t("Opening balance")}</td><td></td><td></td><td></td><td className="num tnum font-bold">{money(open)}</td></tr>
                  {rowsOut.map((l, i) => {
                    const href = drillHref(l);
                    return (
                      <tr key={i}>
                        <td className="text-mute whitespace-nowrap">{dateShort(l.date)}</td>
                        <td className="font-semibold">{l.memo || l.refType}</td>
                        <td>{href ? <Link className="text-xs font-bold text-brand hover:underline tnum" href={href}>{l.refType} #{l.refId}</Link> : <span className="text-xs text-mute">{l.refType}</span>}</td>
                        <td className="num tnum">{l.debit ? money(l.debit) : ""}</td>
                        <td className="num tnum">{l.credit ? money(l.credit) : ""}</td>
                        <td className="num tnum font-bold">{money(l.balance)}</td>
                      </tr>
                    );
                  })}
                  {rowsOut.length === 0 && <tr><td colSpan="6" className="text-mute text-center py-6">{t("No transactions in this period.")}</td></tr>}
                </tbody>
                <tfoot><tr><td colSpan="3" className="font-extrabold">{t("Closing balance")}</td><td className="num tnum font-extrabold">{money(rowsOut.reduce((x, l) => x + l.debit, 0))}</td><td className="num tnum font-extrabold">{money(rowsOut.reduce((x, l) => x + l.credit, 0))}</td><td className="num tnum font-extrabold">{money(rowsOut.length ? rowsOut[rowsOut.length - 1].balance : open)}</td></tr></tfoot>
              </table>
            </div>
          </Card>
        </div>
      );
      return body;
    }

    // ---- party ledger (customers / suppliers) ----
    const [custList, supList] = await Promise.all([
      db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.businessId, b)).orderBy(customers.name),
      db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.businessId, b)).orderBy(suppliers.name),
    ]);
    const kind = sp.kind === "supplier" ? "supplier" : "customer";
    const parties = kind === "customer"
      ? await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.businessId, b)).orderBy(customers.name)
      : await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.businessId, b)).orderBy(suppliers.name);
    // safety: the submitted party must belong to the selected kind, otherwise fall back
    const requested = Number(sp.party);
    const partyId = parties.some((pp) => pp.id === requested) ? requested : parties[0]?.id;
    let ledger = null;
    let outstanding = [];
    if (partyId) {
      ledger = await getPartyLedger(b, kind, partyId);
      if (kind === "customer") {
        outstanding = await db.select({ id: sales.id, no: sales.invoiceNo, date: sales.date, total: sales.total, paid: sql`(${sales.total}::numeric - ${sales.balance}::numeric)`, balance: sales.balance })
          .from(sales).where(and(eq(sales.customerId, partyId), eq(sales.status, "final"), sql`${sales.balance}::numeric > 0`)).orderBy(sales.date);
      } else {
        outstanding = await db.select({ id: purchases.id, no: purchases.purchaseNo, date: purchases.date, total: purchases.total, paid: sql`(${purchases.total}::numeric - ${purchases.balance}::numeric)`, balance: purchases.balance })
          .from(purchases).where(and(eq(purchases.supplierId, partyId), eq(purchases.status, "final"), sql`${purchases.balance}::numeric > 0`)).orderBy(purchases.date);
      }
    }
    body = (
      <div className="space-y-4">
        <LedgerSubNav view="party" sp={sp} t={t} />
        <LedgerPartyFilter kind={kind} partyId={partyId} customers={custList} suppliers={supList} />
        {ledger ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <Card pad={false} className="px-3.5 py-3 border-s-4 border-s-warn"><div className="text-[0.63rem] uppercase font-extrabold text-mute">{t("Balance")}</div><div className="tnum text-xl font-bold text-warn">{money(ledger.party.balance)}</div><div className="text-[0.68rem] text-mute mt-1">{kind === "customer" ? t("receivable from customer") : t("payable to supplier")}</div></Card>
              <Card pad={false} className="px-3.5 py-3 border-s-4 border-s-ok"><div className="text-[0.63rem] uppercase font-extrabold text-mute">{t("Total Debits")}</div><div className="tnum text-xl font-bold">{money(ledger.rows.reduce((a, r) => a + Number(r.debit || 0), 0))}</div></Card>
              <Card pad={false} className="px-3.5 py-3 border-s-4 border-s-ok"><div className="text-[0.63rem] uppercase font-extrabold text-mute">{t("Total Credits")}</div><div className="tnum text-xl font-bold">{money(ledger.rows.reduce((a, r) => a + Number(r.credit || 0), 0))}</div></Card>
              <Card pad={false} className="px-3.5 py-3 border-s-4 border-s-warn"><div className="text-[0.63rem] uppercase font-extrabold text-mute">{t("Open documents")}</div><div className="tnum text-xl font-bold">{outstanding.length}</div><div className="text-[0.68rem] text-mute mt-1 tnum">{money(outstanding.reduce((a, x) => a + Number(x.balance), 0))} {t("outstanding")}</div></Card>
            </div>
            {outstanding.length > 0 && (
              <Card>
                <h3 className="font-display font-bold text-sm mb-2">{t("Outstanding documents")}</h3>
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>{t("Date")}</th><th>{kind === "customer" ? t("Invoice") : t("Purchases")}</th><th className="num">{t("Total")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Remaining")}</th><th className="num">{t("Age (days)")}</th><th></th></tr></thead>
                    <tbody>
                      {outstanding.map((o) => (
                        <tr key={o.id}>
                          <td className="text-mute whitespace-nowrap">{dateShort(o.date)}</td>
                          <td className="tnum font-semibold">{o.no}</td>
                          <td className="num tnum">{money(o.total)}</td>
                          <td className="num tnum text-ok">{money(o.paid)}</td>
                          <td className="num tnum font-bold text-warn">{money(o.balance)}</td>
                          <td className="num tnum">{daysBetween(o.date, today)}</td>
                          <td><Link className="text-xs font-bold text-brand hover:underline no-print" href={kind === "customer" ? `/sales/${o.id}` : `/purchases/${o.id}`}>{t("Open")}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <LedgerView rows={ledger.rows} party={ledger.party} kind={kind}
              whatsappPhone={kind === "customer" ? ledger.party.whatsapp || ledger.party.phone : ledger.party.phone}
              exportHref={`/api/export?type=ledger&kind=${kind}&id=${partyId}`} />
          </>
        ) : <EmptyState title={t("No results")} />}
      </div>
    );
    return body;
  }

  if (tab === "salesmen") {
    const rows = await salesmanPerformance(b, from, to);
    body = (
      <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
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

  const [business] = await db.select().from(businesses).where(eq(businesses.id, b)).limit(1);
  return (
    <div className="space-y-4">
      <div className="hidden print:flex items-center gap-3 mb-2">
        <img src={brandMark(business)} alt="" className="h-10 w-10 rounded-lg" />
        <div>
          <div className="font-display font-bold text-lg">{business?.name}</div>
          <div className="text-xs text-mute">{t("Reports")} · {dateFmt(today)}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Reports")}</h1>
          <div className="text-sm text-mute">Computed live from the transaction books — never from cached totals.</div>
        </div>
        <div className="flex gap-2 no-print">
          <PrintButton size="md" />
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
