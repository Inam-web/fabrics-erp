"use client";
import { useState } from "react";
import { useT } from "@/lib/useT";
import { money } from "@/lib/format";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast } from "@/components/ui";

export function NewAccountButton() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "cash", name: "", bankName: "", accountNo: "", openingBalance: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_account", ...f, openingBalance: Number(f.openingBalance || 0) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${f.type === "bank" ? "Bank account" : "Cash account"} “${f.name}” added`);
      setOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Account</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New cash / bank account">
        <div className="space-y-3">
          <Field label="Type">
            <select className="inp" value={f.type} onChange={set("type")}>
              <option value="cash">Cash (shop drawer)</option>
              <option value="bank">Bank account</option>
            </select>
          </Field>
          <Field label="Account name" required><input className="inp" value={f.name} onChange={set("name")} placeholder={f.type === "bank" ? "HBL Current — Saddar" : "Main Shop Cash"} /></Field>
          {f.type === "bank" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank"><input className="inp" value={f.bankName} onChange={set("bankName")} placeholder="Habib Bank Ltd" /></Field>
              <Field label="Account no."><input className="inp" value={f.accountNo} onChange={set("accountNo")} /></Field>
            </div>
          )}
          <Field label="Opening balance (Rs)"><input type="number" className="inp tnum" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy || !f.name}>{busy ? "Saving…" : "Create account"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function TransferModal({ open, onClose, accounts }) {
  const t = useT();
  const [f, setF] = useState({ from: "", to: "", amount: "", notes: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.from && f.to && f.from !== f.to && Number(f.amount) > 0;
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/cashbank", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", fromAccountId: Number(f.from), toAccountId: Number(f.to), amount: Number(f.amount), notes: f.notes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${t("Account transfer")}: ${money(f.amount)}`);
      setF({ from: "", to: "", amount: "", notes: "" });
      onClose(); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={t("Transfer between accounts")}>
      <p className="text-xs text-mute mb-3">{t("Internal transfer — not counted as income or expense.")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("From account")} required>
          <select className="inp" value={f.from} onChange={set("from")}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.balance)})</option>)}
          </select>
        </Field>
        <Field label={t("To account")} required>
          <select className="inp" value={f.to} onChange={set("to")}>
            <option value="">—</option>
            {accounts.filter((a) => String(a.id) !== f.from).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label={t("Amount (PKR)")} required><input type="number" min="0" className="inp tnum" value={f.amount} onChange={set("amount")} /></Field>
        <Field label={t("Notes")}><input className="inp" value={f.notes} onChange={set("notes")} placeholder={t("e.g. cash deposit to bank")} /></Field>
      </div>
      <div className="mt-3"><ErrorNote error={err} /></div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button onClick={save} disabled={busy || !valid}>{busy ? t("Saving…") : t("Transfer")}</Button>
      </div>
    </Modal>
  );
}

export function CashBankActions({ accounts }) {
  const [trOpen, setTrOpen] = useState(false);
  const t = useT();
  return (
    <div className="flex gap-2 no-print">
      <Button variant="outline" onClick={() => setTrOpen(true)}>{t("Transfer between accounts")}</Button>
      <NewAccountButton />
      <TransferModal open={trOpen} onClose={() => setTrOpen(false)} accounts={accounts} />
    </div>
  );
}
