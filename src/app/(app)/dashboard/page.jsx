import Link from "next/link";
import { cookies } from "next/headers";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleItems, products, payments, customers } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { dashboardData, topCustomers, generateSchedules } from "@/server/services.mjs";
import { lastBackupAgeDays } from "@/server/backup.mjs";
import { money, compact, dateShort, daysBetween, title, waPhone } from "@/lib/format";
import { getLang, makeT } from "@/lib/i18n";
import { Card, Stat, Badge, AppIcon } from "@/components/ui";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  // keep this week's 10% ograi schedules live so targets/progress are always visible
  try { await generateSchedules(user, 1); } catch { /* never block the dashboard */ }
  const d = await dashboardData(user);
  // Backup hygiene: a manual download or a nightly auto-backup both land in the
  // audit trail; nudge the owner when nothing happened for a week (or ever).
  const bkDays = await lastBackupAgeDays(user.businessId, d.today).catch(() => null);
  const monthFrom = d.today.slice(0, 8) + "01";
  const topCust = await topCustomers(user.businessId, monthFrom, d.today, 6);
  const [recentSales, recentPays] = await Promise.all([
    db.select({ id: sales.id, no: sales.invoiceNo, total: sales.total, date: sales.date, name: customers.name, at: sales.createdAt })
      .from(sales).innerJoin(customers, eq(customers.id, sales.customerId))
      .where(and(eq(sales.businessId, user.businessId), eq(sales.status, "final"))).orderBy(desc(sales.createdAt)).limit(5),
    db.select({ id: payments.id, no: payments.receiptNo, amount: payments.amount, date: payments.date, name: customers.name, at: payments.createdAt })
      .from(payments).innerJoin(customers, eq(customers.id, payments.partyId))
      .where(and(eq(payments.businessId, user.businessId), eq(payments.partyType, "customer"), eq(payments.status, "final"), eq(payments.kind, "receipt")))
      .orderBy(desc(payments.createdAt)).limit(5),
  ]);
  const recent = [...recentSales.map((r) => ({ ...r, kind: "sale" })), ...recentPays.map((r) => ({ ...r, kind: "pay" }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 7);
  const kindRows = await db.select({
    kind: sales.saleKind, v: sql`COALESCE(SUM(${sales.total}::numeric),0)`, n: sql`COUNT(*)`,
  }).from(sales).where(and(eq(sales.businessId, user.businessId), gte(sales.date, monthFrom), eq(sales.status, "final"))).groupBy(sales.saleKind);
  const retailMonth = kindRows.find((k) => k.kind === "retail");
  const wholeMonth = kindRows.find((k) => k.kind === "wholesale");
  const topProd = await db.select({
    name: products.name, color: products.color, unit: sql`MAX(${products.unit})`, qty: sql`SUM(${saleItems.qty}::numeric)`, revenue: sql`SUM(${saleItems.total}::numeric)`,
  }).from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(and(eq(sales.businessId, user.businessId), gte(sales.date, monthFrom), eq(sales.status, "final")))
    .groupBy(products.name, products.color).orderBy(sql`SUM(${saleItems.total}::numeric) DESC`).limit(6);

  const gpPct = Number(d.stats.salesTotal) > 0 ? Math.max(0, Math.round((Number(d.todayGp) / Number(d.stats.salesTotal)) * 100)) : 0;
  const kpis = [
    [t("Today's Sales"), money(d.stats.salesTotal), `${t("cash")} ${money(d.stats.cashSales)} · ${t("credit")} ${money(d.stats.creditSales)}`, undefined, { num: d.stats.salesTotal, spark: d.series.sales }],
    [t("Today's Ograi"), money(d.stats.collections), `${d.collectionsToday.length} ${t("receipts")}`, d.stats.collections > 0 ? "ok" : "ink", { num: d.stats.collections, spark: d.series.collections }],
    [t("Today's Expenses"), money(d.stats.expenses), null, d.stats.expenses > 0 ? "warn" : "ink", { num: d.stats.expenses, spark: d.series.expenses }],
    [t("Today's Purchases"), money(d.stats.purchases), null, undefined, { num: d.stats.purchases, spark: d.series.purchases }],
    [t("Today's Gross Profit"), money(d.todayGp), `${gpPct}% ${t("margin")}`, d.todayGp >= 0 ? "ok" : "danger", { num: d.todayGp }],
    [t("Stock Value"), money(d.stockValue), null, undefined, { num: d.stockValue, fmt: "compact" }],
  ];
  // month/balance row — same card skeleton as the KPI row so the grid stays perfectly uniform
  const balances = [
    { label: t("Customer Receivables"), num: d.receivables, sub: money(d.receivables), tone: d.receivables > 0 ? "warn" : "ok" },
    { label: t("Supplier Payables"), num: d.payables, sub: money(d.payables) },
    { label: t("Cash in Hand"), num: d.cashInHand, sub: money(d.cashInHand), tone: "ok" },
    { label: t("Bank Balance"), num: d.bankBalance, sub: money(d.bankBalance), tone: d.bankBalance < 0 ? "danger" : "ok" },
    { label: t("Monthly Revenue / Profit"), num: d.monthRevenue, sub: `${t("Gross profit")} ${money(d.monthGp)} · ${t("Expenses")} ${compact(d.monthExpenses)}`, tone: "brand", spark: d.months.sales },
    { label: t("Sales Mix (Month)"), num: Number(wholeMonth?.v ?? 0) + Number(retailMonth?.v ?? 0), sub: `${t("Wholesale")} ${compact(Number(wholeMonth?.v ?? 0))} · ${t("Retail")} ${compact(Number(retailMonth?.v ?? 0))}` },
  ];

  const weekPct = Number(d.weekAgg.expected) > 0 ? Math.min(100, Math.round(Number(d.weekAgg.collected) / Number(d.weekAgg.expected) * 100)) : 0;

  return (
    <div className="space-y-4">
      {(bkDays === null || bkDays >= 7) && (
        <Link href="/settings" className="flex items-center gap-3 rounded-xl border border-[#c98a1b]/40 bg-[#fdf3dd] px-4 py-3 no-print hover:bg-[#fbe9c4]">
          <span className="text-brand-deep"><AppIcon name="down" size={18} /></span>
          <span className="text-sm text-ink">
            <b>{t("Backup reminder")}:</b>{" "}
            {bkDays === null ? t("You have not taken a backup yet.") : t("No backup has been downloaded for over a week.")}{" "}
            <span className="font-semibold text-brand-deep">{t("Go to Settings → Backup")}</span>
          </span>
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Dashboard")}</h1>
          <div className="text-sm text-mute">{new Date(d.today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {t("live from your registers")}</div>
        </div>
        <div className="flex gap-2 no-print">
          <Link href="/sales/new" className="rounded-md bg-accent hover:bg-[#9c660e] text-white text-sm font-bold px-4 py-2">+ {t("New Sale")}</Link>
          <Link href="/ograi" className="rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-bold px-4 py-2">{t("Ograi Board")}</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {kpis.map(([l, v, s, tone, x]) => <Stat key={l} label={l} value={v} sub={s} tone={tone} {...x} />)}
        {balances.map((x) => <Stat key={x.label} label={x.label} value={compact(x.num)} sub={x.sub} tone={x.tone} num={x.num} fmt="compact" spark={x.spark} />)}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm">{t("Last 6 months")}</h2>
          <div className="flex items-center gap-3 text-[0.68rem] font-bold text-mute">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand inline-block" />{t("Sales")}</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-accent inline-block" />{t("Collected")}</span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-danger inline-block" />{t("Expenses")}</span>
          </div>
        </div>
        {/* columns must stretch (not items-end) so the flex-1 track gets real height and the bars show */}
        <div className="mt-3 flex gap-2 sm:gap-3" style={{ height: "12rem" }}>
          {d.months.keys.map((mk, i) => {
            const max = Math.max(...d.months.sales, ...d.months.expenses, ...d.months.collections, 1);
            const h = (v) => Math.max(2, Math.round((v / max) * 148));
            const label = new Date(mk + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short" });
            return (
              <div key={mk} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="relative w-full flex-1 rounded-lg bg-paper/70 border border-line-soft overflow-hidden">
                  <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-line-soft" />
                  <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-line-soft" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 sm:gap-1.5 px-2">
                    <div title={`${t("Sales")}: ${money(d.months.sales[i])}`} className="w-1/5 max-w-4 rounded-t bg-brand/85 hover:bg-brand transition-colors" style={{ height: `${h(d.months.sales[i])}px` }} />
                    <div title={`${t("Collected")}: ${money(d.months.collections[i])}`} className="w-1/5 max-w-4 rounded-t bg-accent/85 hover:bg-accent transition-colors" style={{ height: `${h(d.months.collections[i])}px` }} />
                    <div title={`${t("Expenses")}: ${money(d.months.expenses[i])}`} className="w-1/5 max-w-4 rounded-t bg-danger/80 hover:bg-danger transition-colors" style={{ height: `${h(d.months.expenses[i])}px` }} />
                  </div>
                </div>
                <div className="text-[0.66rem] font-extrabold uppercase tracking-wide text-mute">{label}</div>
                <div className="text-[0.6rem] text-mute tnum -mt-1">{compact(d.months.sales[i])}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-sm">{t("Today's Collection (Ograi)")}</h2>
            <Link href="/ograi" className="text-xs font-bold text-brand hover:underline no-print">{t("Ograi Board")} ←</Link>
          </div>
          <div className="mt-2 rounded-md bg-brand-soft px-3 py-2.5">
            <div className="tnum text-2xl font-bold text-brand-deep">{money(d.stats.collections)}</div>
            <div className="text-xs text-mute">{d.collectionsToday.length} {t("receipts received today")}</div>
          </div>
          <div className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
            {d.collectionsToday.length === 0 && <div className="text-sm text-mute py-4 text-center">{t("No collections yet today.")}</div>}
            {d.collectionsToday.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b border-line-soft pb-1.5">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-[0.68rem] text-mute">{c.no} · {t(title(c.method))}</div>
                </div>
                <div className="tnum font-bold">{money(c.amount)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-line">
            <div className="flex justify-between text-xs font-bold text-mute mb-1">
              <span>{t("Weekly target progress")}</span><span className="tnum">{money(d.weekAgg.collected)} / {money(d.weekAgg.expected)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-black/8 overflow-hidden">
              <div className={`h-full rounded-full ${weekPct >= 80 ? "bg-ok" : weekPct >= 45 ? "bg-accent" : "bg-danger"}`} style={{ width: `${weekPct}%` }} />
            </div>
            <div className="text-[0.7rem] text-mute mt-1">{weekPct}% {t("of this week's expected ograi collected")}</div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-sm">{t("Overdue & Outstanding Customers")}</h2>
            <div className="flex items-center gap-2">
              {d.overdueAmount > 0 && <Badge tone="danger">{money(d.overdueAmount)} {t("overdue ograi")}</Badge>}
              <Link href="/reports?tab=receivables" className="text-xs font-bold text-brand hover:underline no-print">{t("Receivables")} ←</Link>
            </div>
          </div>
          <div className="mt-2 overflow-x-auto tblwrap">
            <table className="tbl">
              <thead>
                <tr><th>{t("Customer")}</th><th>{t("Area / Salesman")}</th><th className="num">{t("Balance")}</th><th className="num">{t("Ograi Due")}</th><th className="num">{t("Days Over")}</th><th>{t("Last Sale")}</th><th>{t("Status")}</th></tr>
              </thead>
              <tbody>
                {d.overdueSchedules.length === 0 && <tr><td colSpan="7" className="text-center text-mute py-6">{t("No overdue ograi. Everything is on schedule.")}</td></tr>}
                {d.overdueSchedules.slice(0, 10).map((o) => {
                  const days = daysBetween(o.dueDate, d.today);
                  const shortfall = Number(o.expected) - Number(o.collected);
                  const status = days > 21 ? ["Critical", "danger"] : days > 10 ? ["Overdue", "danger"] : days > 3 ? ["Due Soon", "warn"] : ["Current", "ok"];
                  const reminderMsg = encodeURIComponent(`Assalam-o-Alaikum ${o.name},\nYour ograi of Rs ${Math.round(Number(o.expected) - Number(o.collected)).toLocaleString()} is due (week of ${o.weekStart}). Total khata balance: Rs ${Math.round(Number(o.balance)).toLocaleString()}.\nPlease arrange payment — Shukriya.`);
                  return (
                    <tr key={o.scheduleId}>
                      <td>
                        <Link href={`/customers/${o.customerId}`} className="font-semibold hover:text-brand">{o.name}</Link>
                        {o.phone && <a href={`https://wa.me/${waPhone(o.phone)}?text=${reminderMsg}`} target="_blank" rel="noreferrer" title={t("Send WhatsApp reminder")} className="ml-1.5 inline-flex items-center gap-1 text-[0.7rem] font-bold text-ok hover:underline no-print"><AppIcon name="phone" size={12} /> {t("remind")}</a>}
                      </td>
                      <td className="text-mute text-xs">{o.area || "—"}{o.salesman ? ` · ${o.salesman}` : ""}</td>
                      <td className="num tnum">{money(o.balance)}</td>
                      <td className="num tnum font-bold text-danger">{money(shortfall)}</td>
                      <td className="num tnum">{days}{t("d")}</td>
                      <td className="text-mute text-xs">{o.lastSale ? dateShort(o.lastSale) : "—"}</td>
                      <td><Badge tone={status[1]}>{t(status[0])}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <h2 className="font-display font-bold text-sm mb-2">{t("Top Customers (this month)")}</h2>
          <table className="tbl">
            <thead><tr><th>{t("Customer")}</th><th className="num">{t("Bills")}</th><th className="num">{t("Sales")}</th></tr></thead>
            <tbody>
              {topCust.map((c) => (
                <tr key={c.name}><td className="font-semibold">{c.name}</td><td className="num tnum">{String(c.count)}</td><td className="num tnum font-bold">{money(c.total)}</td></tr>
              ))}
              {topCust.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">{t("No sales this month yet.")}</td></tr>}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="font-display font-bold text-sm mb-2">{t("Recent activity")}</h2>
          <div className="space-y-2">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-line-soft pb-1.5 last:border-0">
                <div className="min-w-0">
                  <span className={r.kind === "sale" ? "font-semibold" : "font-semibold text-ok"}>{r.kind === "sale" ? r.no : r.no}</span>
                  <span className="text-mute"> · {r.name}</span>
                  <div className="text-[0.64rem] text-mute">{r.kind === "sale" ? t("Sales") : t("Collected")} · {dateShort(r.date)}</div>
                </div>
                <div className={`tnum font-bold ${r.kind === "pay" ? "text-ok" : ""}`}>{money(r.kind === "sale" ? r.total : r.amount)}</div>
              </div>
            ))}
            {recent.length === 0 && <div className="text-sm text-mute py-6 text-center">{t("No results")}</div>}
          </div>
        </Card>
        <Card>
          <h2 className="font-display font-bold text-sm mb-2">{t("Top Products (this month)")}</h2>
          <table className="tbl">
            <thead><tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Revenue")}</th></tr></thead>
            <tbody>
              {topProd.map((p, i) => (
                <tr key={i}><td className="font-semibold">{p.name}{p.color ? ` · ${p.color}` : ""}</td><td className="num tnum">{Number(p.qty).toLocaleString()}{p.unit ? ` ${p.unit}` : ""}</td><td className="num tnum font-bold">{money(p.revenue)}</td></tr>
              ))}
              {topProd.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">{t("No sales this month yet.")}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
