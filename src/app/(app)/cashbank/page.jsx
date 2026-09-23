import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, payments, expenses, expenseCategories, customers, suppliers } from "@/db/schema";
import { getUser } from "@/server/auth.mjs";
import { redirect } from "next/navigation";
import { money, dateShort } from "@/lib/format";
import { Card, Badge } from "@/components/ui";
import { NewAccountButton } from "./_client";
import { getLang, makeT } from "@/lib/i18n";
import { cookies } from "next/headers";
import { todayStr, addDays, n0, r2 } from "@/server/util.mjs";

export const dynamic = "force-dynamic";

export default async function CashBankPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const t = makeT(getLang(jar.toString()).code);
  const b = user.businessId;
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, b));
  const cash = r2(accs.filter((a) => a.type === "cash").reduce((x, a) => x + n0(a.balance), 0));
  const bank = r2(accs.filter((a) => a.type === "bank").reduce((x, a) => x + n0(a.balance), 0));

  const since = addDays(todayStr(), -14);
  const pays = await db.select({
    id: payments.id, date: payments.date, amount: payments.amount, partyType: payments.partyType,
    accountId: payments.accountId, receiptNo: payments.receiptNo, method: payments.method, status: payments.status,
    party: payments.partyType,
    customer: customers.name, supplier: suppliers.name,
  }).from(payments)
    .leftJoin(customers, and(eq(customers.id, payments.partyId), eq(payments.partyType, "customer")))
    .leftJoin(suppliers, and(eq(suppliers.id, payments.partyId), eq(payments.partyType, "supplier")))
    .where(and(eq(payments.businessId, b), gte(payments.date, since)))
    .orderBy(desc(payments.date), desc(payments.id)).limit(120);
  const exps = await db.select({
    id: expenses.id, date: expenses.date, amount: expenses.amount, accountId: expenses.accountId,
    category: expenseCategories.name, description: expenses.description,
  }).from(expenses).innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(eq(expenses.businessId, b), gte(expenses.date, since)))
    .orderBy(desc(expenses.date), desc(expenses.id)).limit(120);

  const txByAcc = {};
  for (const p of pays) {
    if (p.status !== "final") continue;
    (txByAcc[p.accountId] ||= []).push({
      date: p.date, label: p.partyType === "customer" ? `Receipt ${p.receiptNo} — ${p.customer}` : `Payment ${p.receiptNo} — ${p.supplier}`,
      amount: p.partyType === "customer" ? n0(p.amount) : -n0(p.amount), method: p.method,
    });
  }
  for (const e of exps) {
    (txByAcc[e.accountId] ||= []).push({ date: e.date, label: `Expense — ${e.category}${e.description ? ` (${e.description})` : ""}`, amount: -n0(e.amount), method: "expense" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">{t("Cash & Bank")}</h1>
          <div className="text-sm text-mute">Live positions updated by every sale, payment, purchase and expense.</div>
        </div>
        <NewAccountButton />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card pad={false} className="px-3.5 py-3"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Cash in hand")}</div><div className={`tnum text-xl font-bold ${cash < 0 ? "text-danger" : "text-ok"}`}>{money(cash)}</div></Card>
        <Card pad={false} className="px-3.5 py-3"><div className="text-[0.63rem] uppercase font-bold text-mute">{t("Bank Balance")}</div><div className={`tnum text-xl font-bold ${bank < 0 ? "text-danger" : "text-brand-deep"}`}>{money(bank)}</div></Card>
        <Card pad={false} className="px-3.5 py-3"><div className="text-[0.63rem] uppercase font-bold text-mute">Total liquid</div><div className="tnum text-xl font-bold">{money(r2(cash + bank))}</div></Card>
        <Card pad={false} className="px-3.5 py-3"><div className="text-[0.63rem] uppercase font-bold text-mute">Accounts</div><div className="tnum text-xl font-bold">{accs.length}</div></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {accs.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display font-bold text-sm flex items-center gap-2">
                  {a.name}
                  <Badge tone={a.type === "bank" ? "brand" : "accent"}>{a.type}</Badge>
                </div>
                <div className="text-[0.68rem] text-mute">{a.bankName ? `${a.bankName} · ${a.accountNo}` : "Cash drawer"}</div>
              </div>
              <div className="text-right">
                <div className={`tnum text-lg font-bold ${n0(a.balance) < 0 ? "text-danger" : ""}`}>{money(a.balance)}</div>
                <div className="text-[0.65rem] text-mute">opening {money(a.openingBalance)}</div>
              </div>
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Transaction</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {(txByAcc[a.id] || []).slice(0, 14).map((t, i) => (
                    <tr key={i}>
                      <td className="text-mute whitespace-nowrap text-xs">{dateShort(t.date)}</td>
                      <td className="text-xs">{t.label}</td>
                      <td className={`num tnum font-semibold ${t.amount < 0 ? "text-danger" : "text-ok"}`}>{t.amount < 0 ? "-" : "+"}{money(Math.abs(t.amount))}</td>
                    </tr>
                  ))}
                  {!(txByAcc[a.id] || []).length && <tr><td colSpan="3" className="text-center text-mute py-4 text-xs">No transactions in the last 14 days.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
