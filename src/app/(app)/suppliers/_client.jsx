"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Field, Button, Badge, ErrorNote, toast } from "@/components/ui";
import { money } from "@/lib/format";
import PaymentDialog from "@/components/PaymentDialog";
import { useT } from "@/lib/useT";

export function SuppliersTable({ suppliers }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const rows = useMemo(() => suppliers.filter((s) => {
    if (onlyDue && Number(s.balance) <= 0) return false;
    if (q && !`${s.name} ${s.phone || ""} ${s.code}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [suppliers, q, onlyDue]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <input className="inp !w-64" placeholder="Search supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm font-semibold text-mute">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Payable only
        </label>
        <div className="ml-auto text-xs text-mute tnum">
          {rows.length} suppliers · payable {money(rows.reduce((a, s) => a + Math.max(0, Number(s.balance)), 0))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>{t("Code")}</th><th>{t("Supplier")}</th><th>{t("City")} · {t("Phone")}</th><th>{t("Type")}</th><th>{t("Terms")}</th><th className="num">{t("Balance")}</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="text-mute tnum">{s.code}</td>
                <td><Link href={`/suppliers/${s.id}`} className="font-semibold hover:text-brand">{s.name}</Link><div className="text-[0.68rem] text-mute">{s.contactPerson}</div></td>
                <td className="text-xs text-mute">{s.city || "—"}<br />{s.phone}</td>
                <td><Badge tone="mute">{s.category}</Badge></td>
                <td className="text-xs">{s.paymentTerms}</td>
                <td className="num tnum font-bold">{money(s.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewSupplierButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", contactPerson: "", phone: "", city: "", category: "mill", paymentTerms: "monthly", openingBalance: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Supplier added");
      router.push(`/suppliers/${data.id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ {t("Supplier")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New supplier">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" required><input className="inp" value={f.name} onChange={set("name")} autoFocus /></Field>
          <Field label="Contact person"><input className="inp" value={f.contactPerson} onChange={set("contactPerson")} /></Field>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="City"><input className="inp" value={f.city} onChange={set("city")} /></Field>
          <Field label="Type"><select className="inp" value={f.category} onChange={set("category")}>{["mill", "wholesaler", "importer", "agent"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Payment terms"><select className="inp" value={f.paymentTerms} onChange={set("paymentTerms")}>{["weekly", "biweekly", "monthly"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Opening payable (Rs)"><input type="number" className="inp tnum" value={f.openingBalance} onChange={set("openingBalance")} /></Field>
        </div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy || !f.name}>{busy ? "Saving…" : "Create supplier"}</Button></div>
      </Modal>
    </>
  );
}

export function SupplierActions({ supplier, accounts }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap gap-2 no-print">
        <Link href="/purchases/new" className="rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-bold px-4 py-2">New Purchase</Link>
        <Button onClick={() => setOpen(true)}>{t("Pay Supplier")}</Button>
        <Button variant="outline" onClick={() => window.print()}>{t("Print Statement")}</Button>
      </div>
      <PaymentDialog
        open={open} onClose={() => setOpen(false)}
        party={{ id: supplier.id, name: supplier.name, kind: "supplier", balance: supplier.balance, phone: supplier.phone }}
        accounts={accounts} salesmen={[]}
      />
    </div>
  );
}
