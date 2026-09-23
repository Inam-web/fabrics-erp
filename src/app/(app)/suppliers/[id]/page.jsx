import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { suppliers, accounts, purchases } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { getPartyLedger } from "@/server/services.mjs";
import { redirect, notFound } from "next/navigation";
import { money, dateShort } from "@/lib/format";
import { Card } from "@/components/ui";
import LedgerView from "@/components/LedgerView";
import { SupplierActions } from "../_client";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const sid = Number(id);
  const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.id, sid), eq(suppliers.businessId, user.businessId))).limit(1);
  if (!supplier) notFound();
  const { rows } = await getPartyLedger(user.businessId, "supplier", sid);
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

      <div>
        <h2 className="font-display font-bold text-sm mb-2">Supplier Ledger — {supplier.code}</h2>
        <LedgerView rows={rows} party={supplier} kind="supplier" whatsappPhone={supplier.phone}
          exportHref={`/api/export?type=ledger&kind=supplier&id=${supplier.id}`} />
      </div>
    </div>
  );
}
