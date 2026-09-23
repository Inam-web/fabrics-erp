import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, users, salesmen, salesmanRoutes, auditLogs, dayClosings, accounts, warehouses, employees } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import SettingsClient from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const b = user.businessId;
  const [business] = await db.select().from(businesses).where(eq(businesses.id, b)).limit(1);
  const userList = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, phone: users.phone }).from(users).where(eq(users.businessId, b));
  const sms = await db.select().from(salesmen).where(eq(salesmen.businessId, b));
  const routes = await db.select().from(salesmanRoutes);
  const audit = await db.select().from(auditLogs).where(eq(auditLogs.businessId, b)).orderBy(desc(auditLogs.id)).limit(150);
  const closings = await db.select().from(dayClosings).where(eq(dayClosings.businessId, b)).orderBy(desc(dayClosings.date)).limit(30);
  const whs = await db.select().from(warehouses).where(eq(warehouses.businessId, b));
  const staff = await db.select().from(employees).where(eq(employees.businessId, b));
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, b));

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">{t("Settings & Staff")}</h1>
        <div className="text-sm text-mute">Business profile, users and permissions, salesmen with routes, and the full audit trail.</div>
      </div>
      <SettingsClient
        business={business} users={userList} salesmen={sms} routes={routes} audit={audit} closings={closings} warehouses={whs}
        employees={staff} accounts={accs}
        canManage={["owner", "manager"].includes(user.role)}
      />
    </div>
  );
}
