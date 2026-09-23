import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cheques, customers, suppliers } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import ChequesClient from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ChequesPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const rows = await db.select({
    cheque: cheques, customer: customers.name, supplier: suppliers.name,
  }).from(cheques)
    .leftJoin(customers, and(eq(customers.id, cheques.partyId), eq(cheques.partyType, "customer")))
    .leftJoin(suppliers, and(eq(suppliers.id, cheques.partyId), eq(cheques.partyType, "supplier")))
    .where(eq(cheques.businessId, user.businessId))
    .orderBy(desc(cheques.createdAt)).limit(300);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">{t("Cheques")}</h1>
        <div className="text-sm text-mute">Cheques created by payments land here. Mark clearance or bounce — bounced cheques raise an alert.</div>
      </div>
      <ChequesClient cheques={rows.map((r) => ({ ...r.cheque, party: r.cheque.partyType === "customer" ? r.customer : r.supplier }))} />
    </div>
  );
}
