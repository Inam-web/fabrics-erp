import Link from "next/link";
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleItems, products } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { dashboardData, topCustomers, generateSchedules } from "@/server/services.mjs";
import { money, compact, dateShort, daysBetween, title } from "@/lib/format";
import { getLang, makeT } from "@/lib/i18n";
import { Card, Stat, Badge } from "@/components/ui";
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
  const monthFrom = d.today.slice(0, 8) + "01";
  const topCust = await topCustomers(user.businessId, monthFrom, d.today, 6);
  const kindRows = await db.select({
    kind: sales.saleKind, v: sql`COALESCE(SUM(${sales.total}::numeric),0)`, n: sql`COUNT(*)`,
  }).from(sales).where(and(eq(sales.businessId, user.businessId), gte(sales.date, monthFrom), eq(sales.status, "final"))).groupBy(sales.saleKind);
  const retailMonth = kindRows.find((k) => k.kind === "retail");
  const wholeMonth = kindRows.find((k) => k.kind === "wholesale");
  const topProd = await db.select({
    name: products.name, color: products.color, qty: sql`SUM(${saleItems.qty}::numeric)`, revenue: sql`SUM(${saleItems.total}::numeric)`,
  }).from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(and(eq(sales.businessId, user.businessId), gte(sales.date, monthFrom), eq(sales.status, "final")))
    .groupBy(products.name, products.color).orderBy(sql`SUM(${saleItems.total}::numeric) DESC`).limit(6);

  const kpis = [
    [t("Today's Sales"), money(d.stats.salesTotal), `${t("cash")} ${money(d.stats.cashSales)} · ${t("credit")} ${money(d.stats.creditSales)}`],
    [t("Today's Ograi"), money(d.stats.collections), `${d.collectionsToday.length} ${t("receipts")}`, d.stats.collections > 0 ? "ok" : "ink"],
    [t("Today's Expenses"), money(d.stats.expenses), null, d.stats.expenses > 0 ? "warn" : "ink"],
    [t("Today's Purchases"), money(d.stats.purchases), null],
    [t("Today's Gross Profit"), money(d.todayGp), null, d.todayGp >= 0 ? "ok" : "danger"],
    [t("Stock Value"), money(d.stockValue), null],
  ];

  const weekPct = Number(d.weekAgg.expected) > 0 ? Math.min(100, Math.round(Number(d.weekAgg.collected) / Number(d.weekAgg.expected) * 100)) : 0;

  return (
    <div className="space-y-4">
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
        {kpis.map(([l, v, s, tone]) => <Stat key={l} label={l} value={v} sub={s} tone={tone} />)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
        <Stat label={t("Customer Receivables")} value={compact(d.receivables)} sub={money(d.receivables)} tone={d.receivables > 0 ? "warn" : "ok"} />
        <Stat label={t("Supplier Payables")} value={compact(d.payables)} sub={money(d.payables)} />
        <Stat label={t("Cash in Hand")} value={compact(d.cashInHand)} sub={money(d.cashInHand)} tone="ok" />
        <Stat label={t("Bank Balance")} value={compact(d.bankBalance)} sub={money(d.bankBalance)} tone={d.bankBalance < 0 ? "danger" : "ok"} />
        <Stat label={t("Monthly Revenue / Profit")} value={compact(d.monthRevenue)} sub={`${t("Gross profit")} ${money(d.monthGp)} · ${t("Expenses")} ${compact(d.monthExpenses)}`} tone="brand" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 max-w-xl">
        <Stat label={t("Wholesale sales (month)")} value={money(wholeMonth?.v ?? 0)} sub={`${Number(wholeMonth?.n ?? 0)} ${t("orders")}`} />
        <Stat label={t("Retail sales (month)")} value={money(retailMonth?.v ?? 0)} sub={`${Number(retailMonth?.n ?? 0)} ${t("orders")}`} tone="accent" />
      </div>

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
          <div className="mt-2 overflow-x-auto">
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
                        {o.phone && <a href={`https://wa.me/${String(o.phone).replace(/[^0-9]/g, "")}?text=${reminderMsg}`} target="_blank" rel="noreferrer" title={t("Send WhatsApp reminder")} className="ml-1.5 text-[0.7rem] font-bold text-ok hover:underline no-print">📲 {t("remind")}</a>}
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

      <div className="grid lg:grid-cols-2 gap-4">
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
          <h2 className="font-display font-bold text-sm mb-2">{t("Top Fabrics (this month)")}</h2>
          <table className="tbl">
            <thead><tr><th>{t("Fabric")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Revenue")}</th></tr></thead>
            <tbody>
              {topProd.map((p, i) => (
                <tr key={i}><td className="font-semibold">{p.name}{p.color ? ` · ${p.color}` : ""}</td><td className="num tnum">{Number(p.qty).toLocaleString()} m</td><td className="num tnum font-bold">{money(p.revenue)}</td></tr>
              ))}
              {topProd.length === 0 && <tr><td colSpan="3" className="text-mute text-center py-4">{t("No sales this month yet.")}</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
