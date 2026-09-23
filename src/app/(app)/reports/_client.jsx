"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast } from "@/components/ui";
import { money } from "@/lib/format";

export function CloseDayButton({ date, expectedCash, alreadyClosed }) {
  const [open, setOpen] = useState(false);
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function close() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "close_day", date, actualCash: Number(actual), notes }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Day ${date} closed — difference ${money(Number(actual) - expectedCash)}`);
      setOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (alreadyClosed) return <span className="rounded-md bg-ok-soft text-ok text-xs font-bold px-3 py-2">Day closed — backdated edits restricted to owner/manager</span>;

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)}>Close Day</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Close day — ${date}`}>
        <p className="text-sm text-mute">Once closed, backdated entries for this date require owner/manager rights and are audit-logged. Count your physical cash drawer:</p>
        <div className="mt-3 rounded-md bg-paper border border-line px-3 py-2 text-sm flex justify-between">
          <span>Expected cash (system)</span><span className="tnum font-bold">{money(expectedCash)}</span>
        </div>
        <div className="mt-3 space-y-3">
          <Field label="Actual cash counted (Rs)" required><input type="number" className="inp tnum" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></Field>
          {actual !== "" && (
            <div className={`text-sm font-bold ${Number(actual) - expectedCash === 0 ? "text-ok" : "text-danger"}`}>
              Difference: {money(Number(actual) - expectedCash)}
            </div>
          )}
          <Field label="Notes / reason for difference"><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="accent" onClick={close} disabled={busy || actual === ""}>{busy ? "Closing…" : "Close day"}</Button>
        </div>
      </Modal>
    </>
  );
}
