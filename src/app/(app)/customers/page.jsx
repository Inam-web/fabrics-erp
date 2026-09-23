import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, salesmen } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { CustomersTable, NewCustomerButton } from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const rows = await db.select({
    id: customers.id, code: customers.code, name: customers.name, ownerName: customers.ownerName,
    phone: customers.phone, area: customers.area, category: customers.category, priceLevel: customers.priceLevel,
    balance: customers.balance, creditLimit: customers.creditLimit, weeklyOgrai: customers.weeklyOgrai,
    paymentTerms: customers.paymentTerms, status: customers.status,
  }).from(customers).where(eq(customers.businessId, user.businessId)).orderBy(customers.name);
  const sm = await db.select().from(salesmen).where(eq(salesmen.businessId, user.businessId));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Customers")} — {t("Customer Ledger")}</h1>
          <div className="text-sm text-mute">{rows.length} customer accounts · every sale, payment and return updates these balances automatically.</div>
        </div>
        <div className="flex gap-2 no-print">
          <Link href="/api/export?type=customers" className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">{t("Export CSV")}</Link>
          <NewCustomerButton salesmen={sm} />
        </div>
      </div>
      <CustomersTable customers={rows} />
    </div>
  );
}
