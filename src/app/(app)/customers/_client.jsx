"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Field, Button, Badge, ErrorNote, toast } from "@/components/ui";
import { money } from "@/lib/format";
import { useT } from "@/lib/useT";

const CATS = ["all", "vip", "wholesale", "regular", "cash", "new"];

export function CustomersTable({ customers }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyDue, setOnlyDue] = useState(false);

  const rows = useMemo(() => customers.filter((c) => {
    if (cat !== "all" && c.category !== cat) return false;
    if (onlyDue && Number(c.balance) <= 0) return false;
    if (q && !`${c.name} ${c.ownerName || ""} ${c.phone || ""} ${c.code} ${c.area || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [customers, q, cat, onlyDue]);

  const totalBal = rows.reduce((a, c) => a + Math.max(0, Number(c.balance)), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <input className="inp !w-64" placeholder={t("Search") + "…"} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp !w-40" value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATS.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c.toUpperCase()}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-mute">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> {t("Balance")} &gt; 0
        </label>
        <div className="ml-auto text-xs text-mute tnum">{rows.length} customers · outstanding {money(totalBal)}</div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead>
            <tr><th>{t("Code")}</th><th>{t("Customer")}</th><th>{t("Area")} · {t("Phone")}</th><th>{t("Category")}</th><th>{t("Terms")}</th><th className="num">{t("Ograi / Collections")}</th><th className="num">{t("Credit Limit")}</th><th className="num">{t("Balance")}</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const bal = Number(c.balance);
              const over = Number(c.creditLimit) > 0 && bal > Number(c.creditLimit);
              return (
                <tr key={c.id}>
                  <td className="text-mute tnum">{c.code}</td>
                  <td>
                    <Link href={`/customers/${c.id}`} className="font-semibold hover:text-brand">{c.name}</Link>
                    <div className="text-[0.68rem] text-mute">{c.ownerName}</div>
                  </td>
                  <td className="text-xs text-mute">{c.area || "—"}<br />{c.phone}</td>
                  <td><Badge tone={c.category === "vip" ? "accent" : "mute"}>{c.category}</Badge></td>
                  <td className="text-xs">{c.paymentTerms}</td>
                  <td className="num tnum">{Number(c.weeklyOgrai) ? money(c.weeklyOgrai) : "—"}</td>
                  <td className="num tnum text-mute">{Number(c.creditLimit) ? money(c.creditLimit) : "—"}</td>
                  <td className={`num tnum font-bold ${bal > 0 ? (over ? "text-danger" : "text-ink") : "text-ok"}`}>{money(bal)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="8" className="text-center text-mute py-8">{t("No customers match.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewCustomerButton({ salesmen }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", ownerName: "", phone: "", area: "", category: "wholesale", priceLevel: "wholesale", paymentTerms: "weekly", weeklyOgrai: "", creditLimit: "", openingBalance: "", salesmanId: "", notes: "" });
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, salesmanId: f.salesmanId || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Customer ${f.name} created`);
      router.push(`/customers/${data.id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ {t("Customer")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New customer account" wide>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Business name" required><input className="inp" value={f.name} onChange={set("name")} autoFocus /></Field>
          <Field label="Owner name"><input className="inp" value={f.ownerName} onChange={set("ownerName")} /></Field>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} placeholder="03xx-xxxxxxx" /></Field>
          <Field label="Area"><input className="inp" value={f.area} onChange={set("area")} placeholder="Saddar, Hashtnagri…" /></Field>
          <Field label="Category">
            <select className="inp" value={f.category} onChange={set("category")}>
              {["wholesale", "retail", "vip", "regular", "new", "cash"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Price level">
            <select className="inp" value={f.priceLevel} onChange={set("priceLevel")}>
              <option value="wholesale">Wholesale rate</option><option value="retail">Retail rate</option><option value="vip">VIP rate</option>
            </select>
          </Field>
          <Field label="Payment terms">
            <select className="inp" value={f.paymentTerms} onChange={set("paymentTerms")}>
              {["daily", "weekly", "biweekly", "monthly", "cash"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Assigned salesman">
            <select className="inp" value={f.salesmanId} onChange={set("salesmanId")}>
              <option value="">— None —</option>
              {salesmen.map((sm) => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
            </select>
          </Field>
          <Field label="Manual weekly ograi (Rs)" hint="Leave 0 → automatic rule: 10% of his outstanding balance every week">
            <input type="number" className="inp tnum" value={f.weeklyOgrai} onChange={set("weeklyOgrai")} placeholder="0 = auto 10%" />
          </Field>
          <Field label="Credit limit (Rs)" hint="0 = unlimited credit"><input type="number" className="inp tnum" value={f.creditLimit} onChange={set("creditLimit")} /></Field>
          <Field label="Opening balance (Rs)" hint="Purana hisaab — added as the first ledger entry">
            <input type="number" className="inp tnum" value={f.openingBalance} onChange={set("openingBalance")} />
          </Field>
          <Field label="Notes"><input className="inp" value={f.notes} onChange={set("notes")} /></Field>
        </div>
        <div className="mt-4"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Saving…" : "Create customer"}</Button>
        </div>
      </Modal>
    </>
  );
}
