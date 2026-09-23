import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses, expenseCategories, accounts } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { todayStr, addDays } from "@/server/util.mjs";
import ExpensesClient from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const sp = await searchParams;
  const from = sp.from || addDays(todayStr(), -30);
  const to = sp.to || todayStr();
  const b = user.businessId;

  const conds = [eq(expenses.businessId, b), gte(expenses.date, from), lte(expenses.date, to)];
  const rows = await db.select({
    id: expenses.id, date: expenses.date, amount: expenses.amount, description: expenses.description,
    category: expenseCategories.name, account: accounts.name,
  }).from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .innerJoin(accounts, eq(accounts.id, expenses.accountId))
    .where(and(...conds)).orderBy(desc(expenses.date), desc(expenses.id)).limit(400);
  const [agg] = await db.select({ total: sql`COALESCE(SUM(${expenses.amount}::numeric),0)`, n: sql`COUNT(*)` }).from(expenses).where(and(...conds));
  const cats = await db.select().from(expenseCategories).where(eq(expenseCategories.businessId, b)).orderBy(expenseCategories.name);
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, b));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Expenses")}</h1>
          <div className="text-sm text-mute">Every rupee out of cash or bank — straight into the profit &amp; loss.</div>
        </div>
        <div className="flex gap-2 items-end no-print">
          <form method="GET" className="flex gap-2 items-end">
            <input type="date" name="from" defaultValue={from} className="inp" />
            <input type="date" name="to" defaultValue={to} className="inp" />
            <button className="rounded-md bg-brand text-white text-sm font-semibold px-4 py-2">Filter</button>
          </form>
          <Link href="/api/export?type=expenses" className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:border-brand">{t("Export CSV")}</Link>
        </div>
      </div>
      <ExpensesClient expenses={rows} categories={cats} accounts={accs} totals={agg} from={from} to={to} />
    </div>
  );
}
