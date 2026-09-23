import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionSchedules, customers, salesmen, salesmanRoutes, payments, accounts } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { todayStr, weekMonday, addDays, n0, r2 } from "@/server/util.mjs";
import { generateSchedules } from "@/server/services.mjs";
import OgraiBoard from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function OgraiPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const b = user.businessId;
  const today = todayStr();
  const thisMonday = weekMonday(today);
  const monthStart = today.slice(0, 8) + "01";

  // Peshawar model: weekly ograi (10% of outstanding) is always due — make sure
  // this week's pending schedules exist before rendering the board (idempotent).
  await generateSchedules(user, 1);

  const receipts = await db.select({
    id: payments.id, date: payments.date, amount: payments.amount, method: payments.method,
    receiptNo: payments.receiptNo, customerName: customers.name, customerId: customers.id,
  }).from(payments).innerJoin(customers, eq(customers.id, payments.partyId))
    .where(and(eq(payments.businessId, b), eq(payments.partyType, "customer"), eq(payments.status, "final"), eq(payments.kind, "receipt"), gte(payments.date, thisMonday)))
    .orderBy(desc(payments.createdAt)).limit(60);

  const schedules = await db.select({
    id: collectionSchedules.id, weekStart: collectionSchedules.weekStart, dueDate: collectionSchedules.dueDate,
    expected: collectionSchedules.expected, collected: collectionSchedules.collected,
    customerId: customers.id, customerName: customers.name, area: customers.area, phone: customers.phone,
    customerBalance: customers.balance, salesmanId: customers.salesmanId, salesmanName: salesmen.name,
    manualWeekly: customers.weeklyOgrai,
  }).from(collectionSchedules)
    .innerJoin(customers, eq(customers.id, collectionSchedules.customerId))
    .leftJoin(salesmen, eq(salesmen.id, customers.salesmanId))
    .where(and(eq(collectionSchedules.businessId, b), gte(collectionSchedules.weekStart, addDays(thisMonday, -35)), lte(collectionSchedules.weekStart, addDays(thisMonday, 28))))
    .orderBy(collectionSchedules.weekStart);

  const accs = await db.select().from(accounts).where(eq(accounts.businessId, b));
  const sms = await db.select().from(salesmen).where(eq(salesmen.businessId, b));
  const routes = await db.select({
    id: salesmanRoutes.id, dayOfWeek: salesmanRoutes.dayOfWeek, areas: salesmanRoutes.areas,
    salesmanName: salesmen.name, salesmanId: salesmen.id,
  }).from(salesmanRoutes).innerJoin(salesmen, eq(salesmen.id, salesmanRoutes.salesmanId));

  const weekSchedules = schedules.filter((s) => s.weekStart === thisMonday);
  const weekExpected = r2(weekSchedules.reduce((a, s) => a + n0(s.expected), 0));
  const weekCollected = r2(weekSchedules.reduce((a, s) => a + n0(s.collected), 0));
  const overdue = schedules.filter((s) => s.dueDate < today && n0(s.collected) < n0(s.expected));
  const overdueAmount = r2(overdue.reduce((a, s) => a + n0(s.expected) - n0(s.collected), 0));
  const monthSchedules = schedules.filter((s) => s.weekStart >= monthStart || s.dueDate >= monthStart);
  const [todayCol] = await db.select({ total: sql`COALESCE(SUM(${payments.amount}::numeric),0)` }).from(payments)
    .where(and(eq(payments.businessId, b), eq(payments.date, today), eq(payments.partyType, "customer"), eq(payments.status, "final")));

  const routeExpected = {};
  for (const s of weekSchedules) {
    if (s.salesmanId) routeExpected[s.salesmanId] = r2((routeExpected[s.salesmanId] || 0) + n0(s.expected));
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-xl font-bold">{t("Ograi / Collections")}</h1>
        <div className="text-sm text-mute">
          {t("Expected vs actually received. The khata only moves when money is received — shortfall stays outstanding and visible.")}
        </div>
      </div>
      <OgraiBoard
        schedules={schedules} accounts={accs} salesmen={sms} today={today}
        routes={routes} receipts={receipts}
        canSchedule={["owner", "manager", "accountant"].includes(user.role)}
        summary={{
          thisMonday, weekExpected, weekCollected,
          overdueAmount, overdueCount: overdue.length,
          todayCollected: n0(todayCol.total),
          monthExpected: r2(monthSchedules.reduce((a, s) => a + n0(s.expected), 0)),
          monthCollected: r2(monthSchedules.reduce((a, s) => a + n0(s.collected), 0)),
          routeExpected,
        }}
      />
    </div>
  );
}
