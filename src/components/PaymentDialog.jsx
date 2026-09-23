"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Field, Button, ErrorNote, toast } from "./ui";
import { money, num } from "@/lib/format";
import { useT } from "@/lib/useT";

const METHODS = [
  ["cash", "Cash"], ["bank_transfer", "Bank Transfer"], ["cheque", "Cheque"],
  ["online", "Online Transfer"], ["easypaisa", "Easypaisa"], ["jazzcash", "JazzCash"], ["other", "Other"],
];

export default function PaymentDialog({ open, onClose, party, accounts, salesmen = [], schedule, defaultDate }) {
  const t = useT();
  // party: { id, name, kind: 'customer'|'supplier', balance, phone }
  const router = useRouter();
  const shortfall = schedule ? Math.max(0, Number(schedule.expected) - Number(schedule.collected)) : null;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [accountId, setAccountId] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [date, setDate] = useState(defaultDate || "");
  const [notes, setNotes] = useState(schedule ? "Ograi collection" : "");
  const [cheque, setCheque] = useState({ bank: "", chequeNo: "", expectedDate: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(shortfall != null && shortfall > 0 ? String(shortfall) : Number(party.balance) > 0 ? String(Math.round(Number(party.balance))) : "");
      const cash = accounts.find((a) => a.type === "cash") || accounts[0];
      setAccountId(cash ? String(cash.id) : "");
      setErr("");
    }
  }, [open, party.id, schedule?.id]);

  const bal = Number(party.balance || 0);
  const overpay = party.kind === "customer" && amount && Number(amount) > bal + 0.01;
  const bankAccounts = accounts; // money may land in any cash or bank account regardless of method

  async function submit() {
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyType: party.kind, partyId: party.id, amount: Number(amount), method,
          accountId: Number(accountId), salesmanId: salesmanId ? Number(salesmanId) : null,
          date: date || undefined, notes, scheduleId: schedule?.id || null,
          cheque: method === "cheque" ? cheque : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast(`${party.kind === "customer" ? "Receipt" : "Payment"} ${data.receiptNo} saved — ${money(data.amount)} received`);
      onClose();
      setBusy(false);
      router.refresh();
    } catch (e) {
      setErr(e.message); setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${party.kind === "customer" ? t("Receive Payment") : t("Pay Supplier")} — ${party.name}`}>
      <div className="space-y-3">
        {schedule && (
          <div className="rounded-md bg-accent-soft border border-accent/20 px-3 py-2 text-sm">
            <div className="font-semibold">Ograi schedule · week of {schedule.weekStart}</div>
            <div className="text-xs text-mute mt-0.5 tnum">
              {t("Expected")} {money(schedule.expected)} · {t("Collected")} {money(schedule.collected)} · {t("Remaining")} {money(shortfall)}
            </div>
            <div className="text-[0.7rem] text-mute mt-1">Ledger records only what is actually received — shortfall stays outstanding.</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("Amount received")} (${money(bal)})`} required>
            <input type="number" className="inp tnum" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="500" autoFocus />
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {[bal, shortfall, Number(schedule?.expected || 0), 10000, 25000, 50000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4).map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(Math.round(v)))} className="text-[0.68rem] font-bold rounded border border-line bg-white px-1.5 py-0.5 hover:border-brand tnum">
                  {num(v)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("Date")}><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t("Method")}>
            <select className="inp" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label={method === "cash" ? t("Cash in hand") : t("Account")}>
            <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.balance)})</option>)}
            </select>
          </Field>
          {party.kind === "customer" && salesmen.length > 0 && (
            <Field label={t("Salesman")}>
              <select className="inp" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}>
                <option value="">— Shop / unassigned —</option>
                {salesmen.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        {method === "cheque" && (
          <div className="grid grid-cols-3 gap-3 rounded-md border border-line bg-paper p-3">
            <Field label="Bank"><input className="inp" value={cheque.bank} onChange={(e) => setCheque({ ...cheque, bank: e.target.value })} placeholder="HBL" /></Field>
            <Field label="Cheque no."><input className="inp" value={cheque.chequeNo} onChange={(e) => setCheque({ ...cheque, chequeNo: e.target.value })} /></Field>
            <Field label="Expected clearance"><input type="date" className="inp" value={cheque.expectedDate} onChange={(e) => setCheque({ ...cheque, expectedDate: e.target.value })} /></Field>
          </div>
        )}
        <Field label={t("Notes")}><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" /></Field>
        {overpay && <div className="text-xs text-warn bg-warn-soft rounded-md px-3 py-2">Amount exceeds current balance — the extra {money(Number(amount) - bal)} will be recorded as an advance on the khata.</div>}
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button onClick={submit} disabled={busy || !amount || Number(amount) <= 0}>
            {busy ? t("Saving…") : `${t("Save")} ${party.kind === "customer" ? t("Receipt") : t("Paid")}${amount && Number(amount) > 0 ? ` — ${money(amount)}` : ""}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
