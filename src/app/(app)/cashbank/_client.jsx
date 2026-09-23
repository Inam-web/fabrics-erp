"use client";
import { useState } from "react";
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
