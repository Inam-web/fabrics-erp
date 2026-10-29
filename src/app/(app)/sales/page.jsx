import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { sales, customers, salesmen } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { money, dateShort } from "@/lib/format";
import { Badge, Pager } from "@/components/ui";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SalesPage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const per = 30;
  const conds = [eq(sales.businessId, user.businessId)];
  if (sp.q) conds.push(ilike(sales.invoiceNo, `%${sp.q}%`));
  if (sp.from) conds.push(gte(sales.date, sp.from));
  if (sp.to) conds.push(lte(sales.date, sp.to));
  const manualSub = sql`EXISTS(SELECT 1 FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=${sales.id} AND p.source='retail')`;
  if (sp.src === "wholesale") conds.push(eq(sales.saleKind, "wholesale"));
  if (sp.src === "retail") conds.push(and(eq(sales.saleKind, "retail"), sql`NOT ${manualSub}`));
  if (sp.src === "manual") conds.push(manualSub);
  const where = and(...conds);
  // URL-driven column sorting (?sort=&dir=) — whitelist keeps SQL safe, default stays newest first
  const SORTS = { invoice: sales.invoiceNo, date: sales.date, total: sales.total, paid: sales.paid, balance: sales.balance };
  const skey = SORTS[sp.sort] ? sp.sort : "date";
  const sasc = sp.dir === "asc";
  const orderBy = skey === "date"
    ? (sasc ? [asc(sales.date), asc(sales.id)] : [desc(sales.date), desc(sales.id)])
    : [(sasc ? asc : desc)(SORTS[skey]), desc(sales.id)];
  const sortHref = (key) => {
    const nd = skey === key && sasc ? "desc" : "asc";
    const ps = new URLSearchParams();
    if (sp.q) ps.set("q", sp.q);
    if (sp.from) ps.set("from", sp.from);
    if (sp.to) ps.set("to", sp.to);
    if (sp.src) ps.set("src", sp.src);
    ps.set("sort", key); ps.set("dir", nd);
    return `/sales?${ps.toString()}`;
  };
  // plain helper (not a component) — returns a sortable header cell
  const thSort = (label, k, num) => (
    <th key={k} className={num ? "num" : undefined}>
      <Link href={sortHref(k)} className={`inline-flex items-center gap-1 uppercase tracking-[0.07em] font-extrabold text-[0.68rem] ${num ? "flex-row-reverse" : ""} ${skey === k ? "text-brand-deep" : ""}`}>
        {label}<span className="text-[0.55rem] opacity-70">{skey === k ? (sasc ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
  const [agg] = await db.select({ n: sql`COUNT(*)`, total: sql`COALESCE(SUM(${sales.total}::numeric),0)`, outstanding: sql`COALESCE(SUM(${sales.balance}::numeric),0)` }).from(sales).where(where);
  const rows = await db.select({
    id: sales.id, invoiceNo: sales.invoiceNo, date: sales.date, total: sales.total, paid: sales.paid,
    balance: sales.balance, status: sales.status, isBackdated: sales.isBackdated, saleKind: sales.saleKind,
    hasManual: sql`EXISTS(SELECT 1 FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=${sales.id} AND p.source='retail')`,
    customer: customers.name, customerId: sales.customerId, salesman: salesmen.name,
  }).from(sales).innerJoin(customers, eq(customers.id, sales.customerId)).leftJoin(salesmen, eq(salesmen.id, sales.salesmanId))
    .where(where).orderBy(...orderBy).limit(per).offset((page - 1) * per);
  const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.businessId, user.businessId));
  const pages = Math.max(1, Math.ceil(Number(agg.n) / per));
  const base = `/sales?${(() => { const ps = new URLSearchParams(); if (sp.q) ps.set("q", sp.q); if (sp.from) ps.set("from", sp.from); if (sp.to) ps.set("to", sp.to); if (sp.src) ps.set("src", sp.src); if (sp.sort) ps.set("sort", sp.sort); if (sp.dir) ps.set("dir", sp.dir); return ps.toString().replace(/&$/, ""); })()}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Sales")} — {t("Invoices")}</h1>
          <div className="text-sm text-mute tnum">{agg.n} invoices · {money(agg.total)} billed · {money(agg.outstanding)} still outstanding on invoices</div>
        </div>
        <div className="flex gap-2 no-print">
          <Link href="/api/export?type=sales" className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">{t("Export CSV")}</Link>
          <Link href="/sales/new" className="rounded-md bg-accent hover:bg-[#9c660e] text-white text-sm font-bold px-4 py-2">+ {t("New Sale")}</Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2 items-end no-print" method="GET">
        <div>
          <label className="text-[0.65rem] font-bold uppercase text-mute">Invoice #</label>
          <input name="q" defaultValue={sp.q || ""} className="inp !w-40 mt-0.5" placeholder="INV-…" />
        </div>
        <div>
          <label className="text-[0.65rem] font-bold uppercase text-mute">{t("Source")}</label>
          <select name="src" defaultValue={sp.src || ""} className="inp mt-0.5">
            <option value="">{t("All")}</option>
            <option value="wholesale">{t("Wholesale")}</option>
            <option value="retail">{t("Retail")} — {t("Sell from Wholesale Inventory")}</option>
            <option value="manual">{t("manual retail")}</option>
          </select>
        </div>
        <div>
          <label className="text-[0.65rem] font-bold uppercase text-mute">From</label>
          <input type="date" name="from" defaultValue={sp.from || ""} className="inp mt-0.5" />
        </div>
        <div>
          <label className="text-[0.65rem] font-bold uppercase text-mute">To</label>
          <input type="date" name="to" defaultValue={sp.to || ""} className="inp mt-0.5" />
        </div>
        <button className="rounded-md bg-brand text-white text-sm font-semibold px-4 py-2">Filter</button>
      </form>

      <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr>{thSort(t("Invoice"), "invoice")}{thSort(t("Date"), "date")}<th>{t("Customer")}</th><th>{t("Salesman")}</th>{thSort(t("Total"), "total", true)}{thSort(t("Paid"), "paid", true)}{thSort(t("Balance"), "balance", true)}<th>{t("Status")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/sales/${r.id}`} className="font-bold hover:text-brand tnum">{r.invoiceNo}</Link>{r.isBackdated && <span title="Backdated entry" className="ml-1 text-[0.6rem] font-bold uppercase text-warn">back</span>}{r.saleKind === "retail" && <span className="ml-1"><Badge tone="accent">{t("Retail")}</Badge></span>}{r.hasManual && <span className="ml-1"><Badge tone="warn">{t("manual retail")}</Badge></span>}</td>
                <td className="text-mute whitespace-nowrap">{dateShort(r.date)}</td>
                <td><Link href={`/customers/${r.customerId}`} className="font-semibold hover:text-brand">{r.customer}</Link></td>
                <td className="text-mute text-xs">{r.salesman || "—"}</td>
                <td className="num tnum font-bold">{money(r.total)}</td>
                <td className={`num tnum ${Number(r.paid) > 0 ? "text-ok font-semibold" : "text-mute"}`}>{Number(r.paid) > 0 ? money(r.paid) : "—"}</td>
                <td className={`num tnum ${Number(r.balance) > 0 ? "text-warn font-semibold" : "text-mute"}`}>{Number(r.balance) ? money(r.balance) : "—"}</td>
                <td>{r.status === "void" ? <Badge tone="danger">void</Badge> : Number(r.balance) > 0 ? <Badge tone="warn">credit</Badge> : <Badge tone="ok">settled</Badge>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8" className="text-center text-mute py-10">{t("No invoices found.")}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} base={base} />
    </div>
  );
}
