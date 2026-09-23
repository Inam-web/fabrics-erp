import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
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
  const [agg] = await db.select({ n: sql`COUNT(*)`, total: sql`COALESCE(SUM(${sales.total}::numeric),0)`, outstanding: sql`COALESCE(SUM(${sales.balance}::numeric),0)` }).from(sales).where(where);
  const rows = await db.select({
    id: sales.id, invoiceNo: sales.invoiceNo, date: sales.date, total: sales.total, paid: sales.paid,
    balance: sales.balance, status: sales.status, isBackdated: sales.isBackdated, saleKind: sales.saleKind,
    hasManual: sql`EXISTS(SELECT 1 FROM sale_items i JOIN products p ON p.id=i.product_id WHERE i.sale_id=${sales.id} AND p.source='retail')`,
    customer: customers.name, customerId: sales.customerId, salesman: salesmen.name,
  }).from(sales).innerJoin(customers, eq(customers.id, sales.customerId)).leftJoin(salesmen, eq(salesmen.id, sales.salesmanId))
    .where(where).orderBy(desc(sales.date), desc(sales.id)).limit(per).offset((page - 1) * per);
  const custs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.businessId, user.businessId));
  const pages = Math.max(1, Math.ceil(Number(agg.n) / per));
  const base = `/sales${sp.q || sp.from || sp.to ? `?${sp.q ? `q=${sp.q}&` : ""}${sp.from ? `from=${sp.from}&` : ""}${sp.to ? `to=${sp.to}&` : ""}`.replace(/&$/, "") : ""}`;

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

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>{t("Invoice")}</th><th>{t("Date")}</th><th>{t("Customer")}</th><th>{t("Salesman")}</th><th className="num">{t("Total")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Balance")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/sales/${r.id}`} className="font-bold hover:text-brand tnum">{r.invoiceNo}</Link>{r.isBackdated && <span title="Backdated entry" className="ml-1 text-[0.6rem] font-bold uppercase text-warn">back</span>}{r.saleKind === "retail" && <span className="ml-1"><Badge tone="accent">{t("Retail")}</Badge></span>}{r.hasManual && <span className="ml-1"><Badge tone="warn">{t("manual retail")}</Badge></span>}</td>
                <td className="text-mute whitespace-nowrap">{dateShort(r.date)}</td>
                <td><Link href={`/customers/${r.customerId}`} className="font-semibold hover:text-brand">{r.customer}</Link></td>
                <td className="text-mute text-xs">{r.salesman || "—"}</td>
                <td className="num tnum font-bold">{money(r.total)}</td>
                <td className="num tnum">{money(r.paid)}</td>
                <td className="num tnum">{Number(r.balance) ? money(r.balance) : "—"}</td>
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
