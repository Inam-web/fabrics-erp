import Link from "next/link";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { money, dateShort } from "@/lib/format";
import { Badge, Pager } from "@/components/ui";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const per = 30;
  const conds = [eq(purchases.businessId, user.businessId)];
  if (sp.q) conds.push(ilike(purchases.purchaseNo, `%${sp.q}%`));
  if (sp.from) conds.push(gte(purchases.date, sp.from));
  if (sp.to) conds.push(lte(purchases.date, sp.to));
  const where = and(...conds);
  const [agg] = await db.select({ n: sql`COUNT(*)`, total: sql`COALESCE(SUM(${purchases.total}::numeric),0)`, balance: sql`COALESCE(SUM(${purchases.balance}::numeric),0)` }).from(purchases).where(where);
  const rows = await db.select({
    id: purchases.id, purchaseNo: purchases.purchaseNo, refNo: purchases.refNo, date: purchases.date,
    total: purchases.total, paid: purchases.paid, balance: purchases.balance, supplier: suppliers.name, supplierId: suppliers.id,
  }).from(purchases).innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(where).orderBy(desc(purchases.date), desc(purchases.id)).limit(per).offset((page - 1) * per);
  const pages = Math.max(1, Math.ceil(Number(agg.n) / per));
  const base = `/purchases${sp.q || sp.from || sp.to ? `?${sp.q ? `q=${sp.q}&` : ""}${sp.from ? `from=${sp.from}&` : ""}${sp.to ? `to=${sp.to}&` : ""}`.replace(/&$/, "") : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Purchases")}</h1>
          <div className="text-sm text-mute tnum">{agg.n} purchases · {money(agg.total)} bought · {money(agg.balance)} unpaid to suppliers on these bills</div>
        </div>
        <Link href="/purchases/new" className="rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-bold px-4 py-2 no-print">+ {t("New Purchase")}</Link>
      </div>

      {/* balanced toolbar: calm fixed widths, date-range grouped together, generous air between sections */}
      <form className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-line bg-card px-4 py-3 no-print" method="GET">
        <div className="w-64 shrink-0">
          <label className="text-[0.65rem] font-bold uppercase text-mute">PUR #</label>
          <input name="q" defaultValue={sp.q || ""} className="inp mt-0.5" placeholder="PUR no…" />
        </div>
        <div className="flex items-end gap-x-4 shrink-0">
          <div className="w-44">
            <label className="text-[0.65rem] font-bold uppercase text-mute">{t("From")}</label>
            <input type="date" name="from" defaultValue={sp.from || ""} className="inp mt-0.5" />
          </div>
          <div className="w-44">
            <label className="text-[0.65rem] font-bold uppercase text-mute">{t("To")}</label>
            <input type="date" name="to" defaultValue={sp.to || ""} className="inp mt-0.5" />
          </div>
        </div>
        <button className="shrink-0 rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-semibold px-5 py-2">{t("Filter")}</button>
        {(sp.q || sp.from || sp.to) && <Link href="/purchases" className="shrink-0 text-xs font-bold text-mute hover:text-brand underline pb-2.5">{t("Clear")} ✕</Link>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>{t("Purchases")}</th><th>{t("Date")}</th><th>{t("Supplier")}</th><th>{t("Ref")}</th><th className="num">{t("Total")}</th><th className="num">{t("Paid")}</th><th className="num">{t("Balance")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/purchases/${r.id}`} className="font-bold hover:text-brand tnum">{r.purchaseNo}</Link></td>
                <td className="text-mute whitespace-nowrap">{dateShort(r.date)}</td>
                <td><Link href={`/suppliers/${r.supplierId}`} className="font-semibold hover:text-brand">{r.supplier}</Link></td>
                <td className="text-mute text-xs">{r.refNo || "—"}</td>
                <td className="num tnum font-bold">{money(r.total)}</td>
                <td className={`num tnum ${Number(r.paid) > 0 ? "text-ok font-semibold" : "text-mute"}`}>{Number(r.paid) > 0 ? money(r.paid) : "—"}</td>
                <td className="num tnum">{Number(r.balance) ? <Badge tone="warn">{money(r.balance)}</Badge> : <Badge tone="ok">paid</Badge>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="text-center text-mute py-10">{t("No results")}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} base={base} />
    </div>
  );
}
