"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast } from "@/components/ui";
import { useT } from "@/lib/useT";

export function PaymentActions({ payment, partyName, canManage }) {
  const t = useT();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [notes, setNotes] = useState(payment.notes || "");
  const [method, setMethod] = useState(payment.method);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  async function saveEdit() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/payments/${payment.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", notes, method }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast(`${t("Receipt")} ${payment.receiptNo} — ${t("updated")}`);
      setEditOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function doReverse() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/payments/${payment.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse", reason }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast(`${payment.receiptNo} reversed — balances restored`);
      setRevOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="flex gap-2">
      {canManage && payment.status === "final" && (
        <>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>{t("Edit")}</Button>
          <Button variant="danger" size="sm" onClick={() => setRevOpen(true)}>{t("Reverse payment")}</Button>
        </>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`${t("Edit")} — ${payment.receiptNo}`}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Method")}>
            <select className="inp" value={method} onChange={(e) => setMethod(e.target.value)}>
              {["cash", "bank_transfer", "cheque", "online", "easypaisa", "jazzcash", "other"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label={t("Notes")}><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <p className="text-[0.7rem] text-mute mt-3">{t("Amount changes require reversal + re-entry to keep the audit trail intact.")}</p>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setEditOpen(false)}>{t("Cancel")}</Button>
          <Button onClick={saveEdit} disabled={busy}>{busy ? t("Saving…") : t("Save")}</Button>
        </div>
      </Modal>

      <Modal open={revOpen} onClose={() => setRevOpen(false)} title={`${t("Reverse payment")} — ${payment.receiptNo}`}>
        <p className="text-sm text-mute">
          Reversing restores {partyName}'s outstanding balance, removes the money from the account, reopens the applied invoices and keeps a full audit trail. This cannot be undone.
        </p>
        <div className="mt-3"><Field label="Reason" required><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered by mistake" /></Field></div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRevOpen(false)}>{t("Cancel")}</Button>
          <Button variant="danger" onClick={doReverse} disabled={busy || !reason.trim()}>{busy ? "…" : t("Reverse payment")}</Button>
        </div>
      </Modal>
    </div>
  );
}
