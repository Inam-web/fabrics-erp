"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast } from "@/components/ui";
import PaymentDialog from "@/components/PaymentDialog";
import { money } from "@/lib/format";

export default function CustomerActions({ customer, accounts, salesmen, schedules, canEmi }) {
  const [payOpen, setPayOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [emiOpen, setEmiOpen] = useState(false);
  const [emiMonths, setEmiMonths] = useState(4);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: customer.name, ownerName: customer.ownerName || "", phone: customer.phone || "",
    whatsapp: customer.whatsapp || "", area: customer.area || "", category: customer.category,
    priceLevel: customer.priceLevel, paymentTerms: customer.paymentTerms, weeklyOgrai: customer.weeklyOgrai,
    creditLimit: customer.creditLimit, salesmanId: customer.salesmanId || "", status: customer.status, notes: customer.notes || "",
  });
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const openSchedules = schedules.filter((s) => Number(s.collected) < Number(s.expected));

  async function saveEmi() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/ograi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "installments", customerId: customer.id, months: emiMonths }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`EMI plan created — ${data.created} monthly installment${data.created === 1 ? "" : "s"} of ~${money(data.installment)}`);
      setEmiOpen(false);
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function saveEdit() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Customer updated");
      setEditOpen(false);
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 no-print">
        <Link href={`/sales/new?customer=${customer.id}`} className="rounded-md bg-accent hover:bg-[#9c660e] text-white text-sm font-bold px-4 py-2">New Sale</Link>
        <Button onClick={() => { setScheduleId(""); setPayOpen(true); }}>Receive Payment</Button>
        {canEmi && Number(customer.balance) > 0 && <Button variant="outline" onClick={() => setEmiOpen(true)}>EMI / Installment Plan</Button>}
        <Button variant="outline" onClick={() => window.print()}>Print Statement</Button>
        <Button variant="outline" onClick={() => setEditOpen(true)}>Edit Customer</Button>
      </div>

      {openSchedules.length > 0 && (
        <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft p-3 no-print">
          <div className="text-xs font-bold text-accent uppercase tracking-wide mb-1.5">Open ograi schedules — record against the right week</div>
          <div className="flex flex-wrap gap-2">
            {openSchedules.map((s) => {
              const rem = Number(s.expected) - Number(s.collected);
              return (
                <button key={s.id} onClick={() => { setScheduleId(String(s.id)); setPayOpen(true); }}
                  className="rounded-md border border-accent/40 bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-accent hover:text-white transition-colors">
                  Week of {s.weekStart} · <span className="tnum">{money(rem)}</span> due
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        party={{ id: customer.id, name: customer.name, kind: "customer", balance: customer.balance, phone: customer.phone }}
        accounts={accounts} salesmen={salesmen}
        schedule={openSchedules.find((s) => String(s.id) === scheduleId)}
      />

      <Modal open={emiOpen} onClose={() => setEmiOpen(false)} title={`EMI / installment plan — ${customer.name}`}>
        <p className="text-sm text-mute">Converts the current outstanding <b className="tnum">{money(customer.balance)}</b> into fixed monthly collection targets. Installments appear on the Ograi board; actual collections still reduce the khata only when money is received.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 items-end">
          <Field label="Installments (months)">
            <select className="inp" value={emiMonths} onChange={(e) => setEmiMonths(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8, 10, 12, 18, 24].map((m) => <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>)}
            </select>
          </Field>
          <div className="rounded-md bg-paper border border-line px-3 py-2 text-sm">
            ≈ <b className="tnum">{money(Math.floor(Number(customer.balance) / emiMonths * 100) / 100)}</b> / month
          </div>
        </div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={() => setEmiOpen(false)}>Cancel</Button>
          <Button onClick={saveEmi} disabled={busy}>{busy ? "Creating…" : "Create plan"}</Button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${customer.name}`} wide>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Business name" required><input className="inp" value={f.name} onChange={set("name")} /></Field>
          <Field label="Owner"><input className="inp" value={f.ownerName} onChange={set("ownerName")} /></Field>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="WhatsApp"><input className="inp" value={f.whatsapp} onChange={set("whatsapp")} /></Field>
          <Field label="Area"><input className="inp" value={f.area} onChange={set("area")} /></Field>
          <Field label="Category">
            <select className="inp" value={f.category} onChange={set("category")}>
              {["wholesale", "retail", "vip", "regular", "new", "cash"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Price level">
            <select className="inp" value={f.priceLevel} onChange={set("priceLevel")}>
              <option value="wholesale">Wholesale</option><option value="retail">Retail</option><option value="vip">VIP</option>
            </select>
          </Field>
          <Field label="Payment terms">
            <select className="inp" value={f.paymentTerms} onChange={set("paymentTerms")}>
              {["daily", "weekly", "biweekly", "monthly", "cash", "custom"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Manual weekly ograi (Rs)" hint="0 = automatic 10% of outstanding balance every week"><input type="number" className="inp tnum" value={f.weeklyOgrai} onChange={set("weeklyOgrai")} /></Field>
          <Field label="Credit limit (Rs)"><input type="number" className="inp tnum" value={f.creditLimit} onChange={set("creditLimit")} /></Field>
          <Field label="Salesman">
            <select className="inp" value={f.salesmanId} onChange={set("salesmanId")}>
              <option value="">— None —</option>
              {salesmen.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="inp" value={f.status} onChange={set("status")}>
              <option value="active">active</option><option value="inactive">inactive</option>
            </select>
          </Field>
          <div className="sm:col-span-2"><Field label="Notes"><textarea className="inp" rows="2" value={f.notes} onChange={set("notes")} /></Field></div>
        </div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </Modal>
    </div>
  );
}
