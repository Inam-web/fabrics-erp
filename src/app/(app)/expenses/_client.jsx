"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, ErrorNote, toast } from "@/components/ui";
import { money, dateShort } from "@/lib/format";
import { useT } from "@/lib/useT";

export default function ExpensesClient({ expenses, categories, accounts, totals, from, to }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ date: "", categoryId: categories[0]?.id || "", amount: "", accountId: accounts.find((a) => a.type === "cash")?.id || "", description: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, amount: Number(f.amount) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Expense of ${money(f.amount)} recorded`);
      setF({ ...f, amount: "", description: "" });
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const byCat = {};
  for (const e of expenses) byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-display font-bold text-sm mb-3">{t("Record expense")}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Date")}><input type="date" className="inp" value={f.date} onChange={set("date")} /></Field>
            <Field label={t("Amount")} required><input type="number" min="0" className="inp tnum" value={f.amount} onChange={set("amount")} /></Field>
          </div>
          <Field label={t("Category")}>
            <select className="inp" value={f.categoryId} onChange={set("categoryId")}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t("Paid from")}>
            <select className="inp" value={f.accountId} onChange={set("accountId")}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.balance)})</option>)}
            </select>
          </Field>
          <Field label={t("Description")}><input className="inp" value={f.description} onChange={set("description")} placeholder="e.g. generator diesel" /></Field>
          <ErrorNote error={err} />
          <Button className="w-full justify-center" onClick={save} disabled={busy || !f.amount}>
            {busy ? t("Saving…") : `${t("Save expense")}${f.amount ? ` — ${money(f.amount)}` : ""}`}
          </Button>
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-lg border border-line bg-card px-3 py-2.5">
            <div className="text-[0.62rem] uppercase font-bold text-mute">Total ({from || "all"} → {to || "today"})</div>
            <div className="tnum font-bold text-lg">{money(totals.total)}</div>
            <div className="text-[0.65rem] text-mute">{totals.n} entries</div>
          </div>
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, v]) => (
            <div key={name} className="rounded-lg border border-line bg-card px-3 py-2.5">
              <div className="text-[0.62rem] uppercase font-bold text-mute truncate">{name}</div>
              <div className="tnum font-bold text-lg">{money(v)}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>{t("Date")}</th><th>{t("Category")}</th><th>{t("Description")}</th><th>{t("Account")}</th><th className="num">{t("Amount")}</th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="text-mute whitespace-nowrap">{dateShort(e.date)}</td>
                  <td className="font-semibold">{e.category}</td>
                  <td className="text-xs text-mute">{e.description || "—"}</td>
                  <td className="text-xs">{e.account}</td>
                  <td className="num tnum font-bold">{money(e.amount)}</td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">{t("No transactions in this period.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
