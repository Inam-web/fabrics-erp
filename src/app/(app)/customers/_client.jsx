"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, Field, Button, Badge, ErrorNote, toast, SortHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { useT } from "@/lib/useT";

const CATS = ["all", "vip", "wholesale", "regular", "cash", "new"];
const SORTERS = {
  code: (c) => c.code, name: (c) => c.name.toLowerCase(), area: (c) => (c.area || "").toLowerCase(),
  category: (c) => c.category, weeklyOgrai: (c) => Number(c.weeklyOgrai), creditLimit: (c) => Number(c.creditLimit), balance: (c) => Number(c.balance),
};

export function CustomersTable({ customers }) {
  const t = useT();
  const router = useRouter();
  const [list, setList] = useState("business"); // business accounts vs retail/counter buyers
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState({ k: "name", dir: "asc" });
  const isCounter = (c) => c.paymentTerms === "cash" || c.code === "WALKIN";
  const scoped = customers.filter((c) => (list === "business" ? !isCounter(c) : isCounter(c)));

  const filtered = useMemo(() => scoped.filter((c) => {
    if (cat !== "all" && c.category !== cat) return false;
    if (onlyDue && Number(c.balance) <= 0) return false;
    if (q && !`${c.name} ${c.ownerName || ""} ${c.phone || ""} ${c.code} ${c.area || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [scoped, q, cat, onlyDue]);

  const rows = useMemo(() => {
    const f = SORTERS[sort.k] || SORTERS.name, mul = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => { const x = f(a), y = f(b); return x < y ? -mul : x > y ? mul : 0; });
  }, [filtered, sort]);

  const businessCount = customers.filter((c) => !isCounter(c)).length;
  const retailCount = customers.length - businessCount;

  const totalBal = rows.reduce((a, c) => a + Math.max(0, Number(c.balance)), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <div className="flex items-center rounded-lg bg-black/5 p-1">
          <button type="button" onClick={() => setList("business")}
            className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition-colors ${list === "business" ? "bg-brand text-white shadow-sm" : "text-mute hover:text-ink"}`}>
            {t("Business Accounts")} ({businessCount})
          </button>
          <button type="button" onClick={() => setList("retail")}
            className={`rounded-md px-3.5 py-1.5 text-sm font-bold transition-colors ${list === "retail" ? "bg-accent text-white shadow-sm" : "text-mute hover:text-ink"}`}>
            {t("Retail / Counter Buyers")} ({retailCount})
          </button>
        </div>
      </div>
      {list === "retail" && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-2.5 text-[0.75rem] text-[#7a5a10] no-print">
          {t("One-time counter buyers created during retail sales — kept separate from your business accounts. Their invoices and payments remain fully recorded.")}
        </div>
      )}
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
      <div className="overflow-x-auto tblwrap rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead>
            <tr>
              <SortHeader label={t("Code")} k="code" sort={sort.k} dir={sort.dir} setSort={setSort} />
              <SortHeader label={t("Customer")} k="name" sort={sort.k} dir={sort.dir} setSort={setSort} />
              <SortHeader label={`${t("Area")} · ${t("Phone")}`} k="area" sort={sort.k} dir={sort.dir} setSort={setSort} />
              <SortHeader label={t("Category")} k="category" sort={sort.k} dir={sort.dir} setSort={setSort} />
              <th>{t("Terms")}</th>
              <SortHeader label={t("Ograi / Collections")} k="weeklyOgrai" sort={sort.k} dir={sort.dir} setSort={setSort} num />
              <SortHeader label={t("Credit Limit")} k="creditLimit" sort={sort.k} dir={sort.dir} setSort={setSort} num />
              <SortHeader label={t("Balance")} k="balance" sort={sort.k} dir={sort.dir} setSort={setSort} num />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const bal = Number(c.balance);
              const over = Number(c.creditLimit) > 0 && bal > Number(c.creditLimit);
              return (
                <tr key={c.id} className="rowlink" onClick={() => router.push(`/customers/${c.id}`)}>
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
                  <td className={`num tnum font-bold ${bal > 0 ? (over ? "text-danger" : "text-warn") : "text-ok"}`}>{money(bal)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan="8" className="text-center text-mute py-8">{list === "retail" ? t("No counter buyers yet — they appear here automatically when created during a retail sale.") : t("No customers match.")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomerFormModal({ open, onClose, salesmen = [], onCreated }) {
  const t = useT();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", ownerName: "", phone: "", area: "", category: "wholesale", priceLevel: "wholesale", paymentTerms: "weekly", weeklyOgrai: "", creditLimit: "", openingBalance: "", salesmanId: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, salesmanId: f.salesmanId || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${t("Customer")} ${f.name} — ${t("created")}`);
      const created = { id: data.id, name: f.name.trim(), code: data.code || "", category: f.category, priceLevel: f.priceLevel, balance: Number(f.openingBalance || 0) };
      setF({ name: "", ownerName: "", phone: "", area: "", category: "wholesale", priceLevel: "wholesale", paymentTerms: "weekly", weeklyOgrai: "", creditLimit: "", openingBalance: "", salesmanId: "", notes: "" });
      onCreated(created);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`+ ${t("Add Customer")}`} wide>
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
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button onClick={save} disabled={busy || !f.name.trim()}>{busy ? t("Saving…") : t("Create customer")}</Button>
        </div>
    </Modal>
  );
}

export function NewCustomerButton({ salesmen }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ {t("Customer")}</Button>
      <CustomerFormModal open={open} onClose={() => setOpen(false)} salesmen={salesmen}
        onCreated={(data) => { setOpen(false); router.push(`/customers/${data.id}`); }} />
    </>
  );
}
