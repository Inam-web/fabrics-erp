import { eq } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { SuppliersTable, NewSupplierButton } from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const rows = await db.select().from(suppliers).where(eq(suppliers.businessId, user.businessId)).orderBy(suppliers.name);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Suppliers")}</h1>
          <div className="text-sm text-mute">Purchase bills credit the supplier khata; payments and returns reduce it.</div>
        </div>
        <NewSupplierButton />
      </div>
      <SuppliersTable suppliers={rows} />
    </div>
  );
}
