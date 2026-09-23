// Period reporting engine: weekly / monthly / yearly series + full range detail.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { topProducts, topCustomers, salesmanPerformance } from "./services.mjs";
import { n0, r2 } from "./util.mjs";

const G = {
  day: "d",
  week: "date_trunc('week', d)::date",
  month: "date_trunc('month', d)::date",
  year: "date_trunc('year', d)::date",
};

async function rows(q) {
  return (await db.execute(sql.raw(q))).rows;
}

// Merged series of every metric grouped by day/week/month/year.
export async function seriesFor(b, grain, from, to) {
  const g = G[grain];
  const gOf = (col) => g.replace(/\bd\b/g, col);
  const rg = (col) => (from ? `AND ${col} BETWEEN '${from}' AND '${to}'` : "");
  const D = "date::date"; // document tables' date column
  const [sales, purs, colls, sups, exps, rets, gps, voids, newc, actc] = await Promise.all([
    rows(`WITH x AS (SELECT ${gOf(D)} k, total, paid FROM sales WHERE business_id=${b} AND status='final' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(total::numeric),0) v, COALESCE(sum(paid::numeric),0) cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, total FROM purchases WHERE business_id=${b} AND status='final' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(total::numeric),0) v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, amount FROM payments WHERE business_id=${b} AND party_type='customer' AND status='final' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(amount::numeric),0) v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, amount FROM payments WHERE business_id=${b} AND party_type='supplier' AND status='final' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(amount::numeric),0) v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, amount FROM expenses WHERE business_id=${b} ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(amount::numeric),0) v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, total FROM sales_returns WHERE business_id=${b} ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, COALESCE(sum(total::numeric),0) v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf("s.date::date")} k, (i.total::numeric - i.qty::numeric * i.cost_rate::numeric) gp
                    FROM sale_items i JOIN sales s ON s.id=i.sale_id
                    WHERE s.business_id=${b} AND s.status='final' ${rg("s.date::date")})
          SELECT to_char(k,'YYYY-MM-DD') k, 0 AS n, 0 AS v, 0 AS cash, COALESCE(sum(gp),0) gpv FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k FROM sales WHERE business_id=${b} AND status='void' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, 0 AS v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf("d")} k FROM (SELECT created_at::date d FROM customers WHERE business_id=${b}) c ${rg("d").replace(/^AND/, "WHERE")})
          SELECT to_char(k,'YYYY-MM-DD') k, count(*) n, 0 AS v, 0 AS cash FROM x GROUP BY k`),
    rows(`WITH x AS (SELECT ${gOf(D)} k, customer_id FROM sales WHERE business_id=${b} AND status='final' ${rg(D)})
          SELECT to_char(k,'YYYY-MM-DD') k, count(DISTINCT customer_id) n, 0 AS v, 0 AS cash FROM x GROUP BY k`),
  ]);
  const map = new Map();
  const put = (k) => { if (!map.has(k)) map.set(k, { k, invoices: 0, sales: 0, cashSales: 0, purchaseCount: 0, purchases: 0, collections: 0, collectionCount: 0, supPayments: 0, expenses: 0, expenseCount: 0, returns: 0, returnCount: 0, gp: 0, voids: 0, newCustomers: 0, activeCustomers: 0 }); return map.get(k); };
  for (const r of sales) { const o = put(r.k); o.invoices += Number(r.n); o.sales = r2(o.sales + Number(r.v)); o.cashSales = r2(o.cashSales + Number(r.cash)); }
  for (const r of purs) { const o = put(r.k); o.purchaseCount += Number(r.n); o.purchases = r2(o.purchases + Number(r.v)); }
  for (const r of colls) { const o = put(r.k); o.collectionCount += Number(r.n); o.collections = r2(o.collections + Number(r.v)); }
  for (const r of sups) { const o = put(r.k); o.supPayments = r2(o.supPayments + Number(r.v)); }
  for (const r of exps) { const o = put(r.k); o.expenseCount += Number(r.n); o.expenses = r2(o.expenses + Number(r.v)); }
  for (const r of rets) { const o = put(r.k); o.returnCount += Number(r.n); o.returns = r2(o.returns + Number(r.v)); }
  for (const r of gps) { const o = put(r.k); o.gp = r2(o.gp + Number(r.gpv)); }
  for (const r of voids) { const o = put(r.k); o.voids += Number(r.n); }
  for (const r of newc) { const o = put(r.k); o.newCustomers += Number(r.n); }
  for (const r of actc) { const o = put(r.k); o.activeCustomers += Number(r.n); }
  return [...map.values()].sort((a, x) => (a.k < x.k ? 1 : -1)); // newest first
}

// Full detail for one range: KPIs + sub-period breakdown + tops + methods + categories + ograi.
export async function rangeReport(b, from, to, subgrain) {
  const s = await seriesFor(b, "day", from, to).then((xs) => xs.reduce((a, r) => {
    a.invoices += r.invoices; a.sales = r2(a.sales + r.sales); a.cashSales = r2(a.cashSales + r.cashSales);
    a.purchases = r2(a.purchases + r.purchases); a.collections = r2(a.collections + r.collections);
    a.supPayments = r2(a.supPayments + r.supPayments); a.expenses = r2(a.expenses + r.expenses);
    a.returns = r2(a.returns + r.returns); a.gp = r2(a.gp + r.gp); a.voids += r.voids;
    a.newCustomers += r.newCustomers; return a;
  }, { invoices: 0, sales: 0, cashSales: 0, purchases: 0, collections: 0, supPayments: 0, expenses: 0, returns: 0, gp: 0, voids: 0, newCustomers: 0 }));
  const [act] = await rows(`SELECT count(DISTINCT customer_id) n FROM sales WHERE business_id=${b} AND status='final' AND date::date BETWEEN '${from}' AND '${to}'`);
  const kindSplit = await rows(`SELECT COALESCE(sale_kind,'wholesale') kind, count(*) n, COALESCE(sum(total::numeric),0) v, COALESCE(sum(paid::numeric),0) cash FROM sales WHERE business_id=${b} AND status='final' AND date::date BETWEEN '${from}' AND '${to}' GROUP BY sale_kind`);
  const breakdown = await seriesFor(b, subgrain, from, to);
  const [methods, cats, ograi] = await Promise.all([
    rows(`SELECT method, count(*) n, COALESCE(sum(amount::numeric),0) v FROM payments
          WHERE business_id=${b} AND party_type='customer' AND status='final' AND date::date BETWEEN '${from}' AND '${to}'
          GROUP BY method ORDER BY v DESC`),
    rows(`SELECT ec.name, count(*) n, COALESCE(sum(e.amount::numeric),0) v FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id
          WHERE e.business_id=${b} AND e.date::date BETWEEN '${from}' AND '${to}' GROUP BY ec.name ORDER BY v DESC`),
    rows(`SELECT COALESCE(sum(expected::numeric),0) e, COALESCE(sum(collected::numeric),0) c FROM collection_schedules
          WHERE business_id=${b} AND week_start::date BETWEEN '${from}' AND '${to}'`),
  ]);
  const [topsP, topsC, sms] = await Promise.all([
    topProducts(b, from, to, 10),
    topCustomers(b, from, to, 10),
    salesmanPerformance(b, from, to),
  ]);
  return {
    kpis: {
      ...s, creditSales: r2(s.sales - s.cashSales), activeCustomers: Number(act?.n || 0),
      avgInvoice: s.invoices ? r2(s.sales / s.invoices) : 0,
      ograiExpected: n0(ograi?.e), ograiCollected: n0(ograi?.c),
      collectionRate: n0(ograi?.e) > 0 ? Math.round((n0(ograi?.c) / n0(ograi?.e)) * 100) : null,
      netPosition: r2(s.collections - s.supPayments - s.expenses),
      wholesaleRevenue: n0(kindSplit.find((k) => k.kind === "wholesale")?.v), wholesaleOrders: Number(kindSplit.find((k) => k.kind === "wholesale")?.n || 0),
      retailRevenue: n0(kindSplit.find((k) => k.kind === "retail")?.v), retailOrders: Number(kindSplit.find((k) => k.kind === "retail")?.n || 0),
    },
    breakdown, methods, cats, topProducts: topsP, topCustomers: topsC, salesmen: sms,
  };
}
