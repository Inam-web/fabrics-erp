import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { expenses, expenseCategories, accounts } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { addExpense } from "@/server/services.mjs";
import { canManageMoney, BizError } from "@/server/util.mjs";

export const POST = api(async ({ user, req }) => {
  if (!canManageMoney(user.role)) throw new BizError("Only owner, manager, accountant or cashier can record expenses", 403);
  return addExpense(user, await body(req));
});

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const conds = [eq(expenses.businessId, user.businessId)];
  if (p.get("from")) conds.push(gte(expenses.date, p.get("from")));
  if (p.get("to")) conds.push(lte(expenses.date, p.get("to")));
  if (p.get("categoryId")) conds.push(eq(expenses.categoryId, Number(p.get("categoryId"))));
  const where = and(...conds);
  const rows = await db.select({
    id: expenses.id, date: expenses.date, amount: expenses.amount, description: expenses.description,
    category: expenseCategories.name, account: accounts.name,
  }).from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .innerJoin(accounts, eq(accounts.id, expenses.accountId))
    .where(where).orderBy(desc(expenses.date), desc(expenses.id)).limit(300);
  const [agg] = await db.select({ total: sql`COALESCE(SUM(${expenses.amount}::numeric),0)`, n: sql`COUNT(*)` }).from(expenses).where(where);
  const cats = await db.select().from(expenseCategories).where(eq(expenseCategories.businessId, user.businessId)).orderBy(expenseCategories.name);
  return { expenses: rows, totals: agg, categories: cats };
});
