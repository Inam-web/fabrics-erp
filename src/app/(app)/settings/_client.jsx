"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, Badge, Card, ErrorNote, toast } from "@/components/ui";
import { money, dtFmt, dateFmt } from "@/lib/format";
import { useT } from "@/lib/useT";
import { BRAND, brandMark } from "@/lib/brand.mjs";

const ROLES = [["owner", "Owner / Super Admin"], ["manager", "Manager"], ["accountant", "Accountant"], ["cashier", "Cashier"], ["salesman", "Salesman"], ["warehouse", "Warehouse Staff"]];

export default function SettingsClient({ business, users, salesmen, routes, audit, closings, warehouses, employees, accounts, canManage, demo, isOwner, mailbox, isDemoOwner }) {
  const t = useT();
  const [tab, setTab] = useState("business");
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line flex-wrap">
        {[["business", t("Business Profile")], ["users", t("Users & Roles")], ["salesmen", t("Salesmen & Routes")], ["staff", t("Staff & Payroll")], ["warehouses", t("Godowns")], ...(isDemoOwner && demo ? [["demo", t("Demo Access")]] : []), ...(isDemoOwner ? [["mailbox", `${t("Owner Mailbox")}${(mailbox || []).some((m) => !m.read) ? " ●" : ""}`]] : []), ["audit", t("Audit Log")], ["closings", t("Day Closings")]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-brand text-brand-deep" : "border-transparent text-mute hover:text-ink"}`}>{l}</button>
        ))}
      </div>

      {tab === "business" && <BusinessForm business={business} canManage={canManage} />}
      {tab === "users" && <UsersPanel users={users} canManage={canManage} router={router} />}
      {tab === "salesmen" && <SalesmenPanel salesmen={salesmen} routes={routes} canManage={canManage} router={router} />}
      {tab === "warehouses" && <WarehousesPanel warehouses={warehouses} canManage={canManage} router={router} />}
      {tab === "demo" && demo && <DemoAccessPanel demo={demo} />}
      {tab === "mailbox" && isDemoOwner && <OwnerMailboxPanel mailbox={mailbox || []} />}
      {tab === "staff" && <StaffPanel employees={employees || []} accounts={accounts || []} canManage={canManage} router={router} />}

      {tab === "audit" && (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="text-mute whitespace-nowrap text-xs">{dtFmt(a.createdAt)}</td>
                  <td className="text-xs">{users.find((u) => u.id === a.userId)?.name || `#${a.userId}`}</td>
                  <td className="font-semibold">{a.action}</td>
                  <td className="text-xs text-mute">{a.entityType} {a.entityId ? `#${a.entityId}` : ""}</td>
                  <td className="text-xs text-mute max-w-md truncate">{a.reason || a.newValues || "—"}</td>
                </tr>
              ))}
              {audit.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">No audit entries yet — overrides, voids and adjustments will appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "closings" && (
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>Date</th><th className="num">Expected</th><th className="num">Actual</th><th className="num">Difference</th><th>Notes</th></tr></thead>
            <tbody>
              {closings.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{dateFmt(c.date)}</td>
                  <td className="num tnum">{money(c.expectedCash)}</td>
                  <td className="num tnum">{money(c.actualCash)}</td>
                  <td className={`num tnum font-bold ${Number(c.difference) === 0 ? "text-ok" : "text-danger"}`}>{money(c.difference)}</td>
                  <td className="text-xs text-mute">{c.notes || "—"}</td>
                </tr>
              ))}
              {closings.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">No days closed yet. Use Reports → Daily Closing.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BusinessForm({ business, canManage }) {
  const t = useT();
  const [f, setF] = useState({ name: business.name, phone: business.phone || "", address: business.address || "", taxPct: business.taxPct || "0", invoiceFooter: business.invoiceFooter || "", logo: business.logo || "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function onLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 250000) return setErr("Logo must be under 250 KB — use a small PNG/JPG.");
    const rd = new FileReader();
    rd.onload = () => setF((p) => ({ ...p, logo: String(rd.result) }));
    rd.readAsDataURL(file);
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_business", ...f }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Business profile saved");
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="max-w-xl rounded-lg border border-line bg-card p-4 space-y-3">
      <Field label="Business name"><input className="inp" value={f.name} onChange={set("name")} disabled={!canManage} /></Field>
      <div className="flex items-center gap-3">
        <div className="h-14 w-24 rounded-md border border-dashed border-line bg-white flex items-center justify-center overflow-hidden">
          {f.logo ? <img src={f.logo} alt="logo" className="max-h-full max-w-full object-contain" /> : <span className="text-[0.62rem] text-mute">no logo</span>}
        </div>
        <div>
          <label className="text-[0.7rem] font-bold text-mute uppercase tracking-wide">Logo (appears on invoices)</label>
          <div className="flex gap-2 mt-1">
            <input type="file" accept="image/png,image/jpeg" onChange={onLogo} disabled={!canManage} className="text-xs" />
            {f.logo && <button className="text-xs font-bold text-danger hover:underline" onClick={() => setF({ ...f, logo: "" })}>remove</button>}
          </div>
        </div>
      </div>
      <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} disabled={!canManage} /></Field>
      <Field label="Address"><input className="inp" value={f.address} onChange={set("address")} disabled={!canManage} /></Field>
      <Field label="Tax % (applied if selected at billing)"><input type="number" className="inp tnum" value={f.taxPct} onChange={set("taxPct")} disabled={!canManage} /></Field>
      <Field label="Invoice footer message"><textarea className="inp" rows="2" value={f.invoiceFooter} onChange={set("invoiceFooter")} disabled={!canManage} /></Field>
      <ErrorNote error={err} />
      {canManage && <Button onClick={save} disabled={busy}>{busy ? t("Saving…") : t("Save business profile")}</Button>}
      <div className="mt-4 pt-4 border-t border-line">
        <h3 className="font-display font-bold text-sm mb-2">Brand identity</h3>
        <div className="flex items-center gap-4 rounded-lg border border-line bg-paper px-4 py-3">
          <img src={f.logo || BRAND.mark} alt="" className="h-11 w-11 rounded-xl shadow-sm" />
          <img src={BRAND.lockupDark} alt="AfridiTech — Wholesale Retail ERP" className="h-9 w-auto" />
          <span className="text-xs text-mute ms-auto">{t("Used across sidebar, login, invoices, prints & reports.")}</span>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-line">
        <h3 className="font-display font-bold text-sm mb-1">Backup</h3>
        <p className="text-xs text-mute mb-2">Download every table of this business as a single JSON file (customers, khata, invoices, stock, payments, journal, audit trail…).</p>
        <a href="/api/backup" className="inline-flex rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-semibold px-4 py-2">⬇ Download full backup</a>
      </div>
    </div>
  );
}

function UsersPanel({ users, canManage, router }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "salesman", phone: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_user", ...f }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`User ${f.name} added`);
      setBusy(false);
      setOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function toggle(id) {
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle_user", id }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error, "err");
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="space-y-3">
      {canManage && <Button onClick={() => setOpen(true)}>+ Add User</Button>}
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-semibold">{u.name}</td>
                <td className="text-xs">{u.email}</td>
                <td className="text-xs tnum">{u.phone || "—"}</td>
                <td><Badge tone={u.role === "owner" ? "accent" : u.role === "manager" ? "brand" : "mute"}>{u.role}</Badge></td>
                <td>{u.active ? <Badge tone="ok">active</Badge> : <Badge tone="danger">disabled</Badge>}</td>
                {canManage && <td><button onClick={() => toggle(u.id)} className="text-xs font-bold text-brand hover:underline">{u.active ? "Disable" : "Enable"}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-mute leading-relaxed">
        Role powers: owner/manager can void invoices, override credit limits and negative stock, close days and edit settings.
        Accountant/cashier manage money and closings. Salesmen bill and collect ograi. Warehouse staff adjust stock.
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <div className="space-y-3">
          <Field label="Full name" required><input className="inp" value={f.name} onChange={set("name")} /></Field>
          <Field label="Email" required><input className="inp" value={f.email} onChange={set("email")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password" required><input type="password" className="inp" value={f.password} onChange={set("password")} /></Field>
            <Field label="Role"><select className="inp" value={f.role} onChange={set("role")}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} /></Field>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy || !f.name || !f.email || !f.password}>{busy ? "Adding…" : "Add user"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function StaffPanel({ employees, accounts, canManage, router }) {
  const t = useT();
  const [f, setF] = useState({ name: "", phone: "", role: "", salary: "" });
  const [payFor, setPayFor] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payAcc, setPayAcc] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const cashAcc = accounts.find((a) => a.type === "cash");

  async function addEmp() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_employee", ...f }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Employee ${f.name} added`);
      setF({ name: "", phone: "", role: "", salary: "" });
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function paySalary() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay_salary", employeeId: payFor.id, amount: Number(payAmt), month: payMonth, accountId: Number(payAcc) || cashAcc?.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Salary of ${money(payAmt)} paid to ${payFor.name} — recorded as expense`);
      setPayFor(null);
      setBusy(false);
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th className="num">Monthly Salary</th><th>Joined</th><th className="no-print"></th></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="font-semibold">{e.name}</td>
                <td className="text-xs">{e.role || "—"}</td>
                <td className="text-xs tnum">{e.phone || "—"}</td>
                <td className="num tnum font-bold">{money(e.salary)}</td>
                <td className="text-xs text-mute">{e.joiningDate || "—"}</td>
                <td className="no-print">
                  {canManage && <button className="text-xs font-bold text-brand hover:underline"
                    onClick={() => { setPayFor(e); setPayAmt(String(Math.round(Number(e.salary) || 0))); setPayAcc(String(cashAcc?.id || "")); }}>Pay salary</button>}
                </td>
              </tr>
            ))}
            {employees.length === 0 && <tr><td colSpan="6" className="text-center text-mute py-6">No employees yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="rounded-lg border border-line bg-card p-4 max-w-2xl">
          <h3 className="font-display font-bold text-sm mb-2">{t("Add employee")}</h3>
          <div className="grid sm:grid-cols-4 gap-2">
            <input className="inp" placeholder="Name" value={f.name} onChange={set("name")} />
            <input className="inp" placeholder="Role (e.g. Salesman)" value={f.role} onChange={set("role")} />
            <input className="inp" placeholder="Phone" value={f.phone} onChange={set("phone")} />
            <input className="inp tnum" placeholder="Salary (Rs)" type="number" value={f.salary} onChange={set("salary")} />
          </div>
          <div className="mt-2"><ErrorNote error={err} /></div>
          <Button className="mt-2" onClick={addEmp} disabled={busy || !f.name}>{busy ? "Adding…" : "Add employee"}</Button>
        </div>
      )}

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title={`Pay salary — ${payFor?.name}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (Rs)"><input type="number" className="inp tnum" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} /></Field>
            <Field label="Salary month"><input type="month" className="inp" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} /></Field>
          </div>
          <Field label="Paid from">
            <select className="inp" value={payAcc} onChange={(e) => setPayAcc(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({money(a.balance)})</option>)}
            </select>
          </Field>
          <div className="text-xs text-mute">This records an expense in the Salaries category and reduces the selected account — it flows into Profit &amp; Loss automatically.</div>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayFor(null)}>Cancel</Button>
            <Button onClick={paySalary} disabled={busy || !payAmt}>{busy ? "Paying…" : `Pay ${payAmt ? money(payAmt) : ""}`}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function WarehousesPanel({ warehouses, canManage, router }) {
  const t = useT();
  const [name, setName] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_warehouse", name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Godown “${name}” added`);
      setBusy(false);
      setName(""); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="space-y-3 max-w-xl">
      <div className="rounded-lg border border-line bg-card p-4">
        <h3 className="font-display font-bold text-sm mb-2">Godowns &amp; shops</h3>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Type</th></tr></thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id}><td className="font-semibold">{w.name}</td><td>{w.isMain ? <Badge tone="brand">main</Badge> : <Badge tone="mute">godown</Badge>}</td></tr>
            ))}
          </tbody>
        </table>
        {canManage && (
          <div className="mt-3 flex gap-2">
            <input className="inp" placeholder="New godown name…" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={add} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add"}</Button>
          </div>
        )}
        <div className="mt-2"><ErrorNote error={err} /></div>
      </div>
    </div>
  );
}

function SalesmenPanel({ salesmen, routes, canManage, router }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", commissionType: "percent_collection", commissionRate: "1" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_salesman", ...f }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Salesman added");
      setBusy(false);
      setOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <div className="space-y-4">
      {canManage && <Button onClick={() => setOpen(true)}>+ Add Salesman</Button>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Phone</th><th>Commission</th></tr></thead>
            <tbody>
              {salesmen.map((sm) => (
                <tr key={sm.id}>
                  <td className="font-semibold">{sm.name}</td>
                  <td className="text-xs tnum">{sm.phone || "—"}</td>
                  <td className="text-xs">{sm.commissionType === "none" ? "—" : `${sm.commissionRate}% of ${sm.commissionType === "percent_sales" ? "sales" : "collections"}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-line bg-card p-4">
          <h3 className="font-display font-bold text-sm mb-2">Weekly routes</h3>
          {routes.map((r) => (
            <div key={r.id} className="text-sm border-b border-line-soft py-1.5">
              <span className="font-bold">{salesmen.find((x) => x.id === r.salesmanId)?.name}</span>
              <span className="text-mute"> · {days[r.dayOfWeek]}: </span>{r.areas}
            </div>
          ))}
          {routes.length === 0 && <div className="text-sm text-mute">No routes defined.</div>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add salesman">
        <div className="space-y-3">
          <Field label="Name" required><input className="inp" value={f.name} onChange={set("name")} /></Field>
          <Field label="Phone"><input className="inp" value={f.phone} onChange={set("phone")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Commission type">
              <select className="inp" value={f.commissionType} onChange={set("commissionType")}>
                <option value="none">None</option><option value="percent_sales">% of sales</option><option value="percent_collection">% of collections</option>
              </select>
            </Field>
            <Field label="Rate %"><input type="number" step="0.1" className="inp tnum" value={f.commissionRate} onChange={set("commissionRate")} /></Field>
          </div>
          <ErrorNote error={err} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy || !f.name}>{busy ? "Adding…" : "Add salesman"}</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function DemoAccessPanel({ demo }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ clientName: "", clientEmail: "", note: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function act(action, id, status) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, status }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.refresh();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  async function create() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_grant", ...f }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNewCode(d.code);
      setF({ clientName: "", clientEmail: "", note: "" });
      router.refresh();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-display font-bold text-sm">{t("Demo Access Control")}</h3>
        <p className="text-xs text-mute mt-1">{t("Demo access is invitation-only. Share a code with an authorized client; each code allows")} {demo.limit} {t("entries per module")} ({demo.modules.join(", ")}). {t("Demo data is fully separate from real business data.")}</p>
        {newCode && (
          <div className="mt-3 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3 text-sm">
            <div className="font-bold text-ok">{t("New access code")}</div>
            <div className="tnum text-lg font-extrabold mt-1 select-all">{newCode}</div>
            <div className="text-[0.7rem] text-mute mt-1">{t("Share it securely with the client. It appears nowhere publicly.")}</div>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Field label={t("Client name")} required><input className="inp" value={f.clientName} onChange={set("clientName")} /></Field>
          <Field label={t("Client email")}><input className="inp" value={f.clientEmail} onChange={set("clientEmail")} /></Field>
          <Field label={t("Note")}><input className="inp" value={f.note} onChange={set("note")} /></Field>
        </div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <Button className="mt-3" onClick={create} disabled={busy || !f.clientName.trim()}>{busy ? t("Saving…") : t("Grant demo access")}</Button>
      </Card>
      <Card>
        <h3 className="font-display font-bold text-sm mb-2">{t("Authorized clients")} · {demo.business}</h3>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>{t("Client")}</th><th>{t("Code")}</th><th>{t("Status")}</th><th>{t("Usage")} ({demo.limit}/{t("module")})</th><th>{t("Created")}</th><th></th></tr></thead>
            <tbody>
              {demo.grants.map((g) => (
                <tr key={g.id}>
                  <td className="font-semibold">{g.clientName}{g.clientEmail ? <span className="text-mute text-xs"> · {g.clientEmail}</span> : null}</td>
                  <td className="tnum font-bold">{g.code}</td>
                  <td>{g.status === "active" ? <Badge tone="ok">active</Badge> : <Badge tone="danger">revoked</Badge>}</td>
                  <td className="text-xs tnum">{demo.modules.map((m) => `${m.slice(0, 4)}:${g.usage[m] || 0}`).join(" · ")}</td>
                  <td className="text-xs text-mute">{new Date(g.createdAt).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap">
                    {g.status === "active"
                      ? <button className="text-xs font-bold text-danger hover:underline" disabled={busy} onClick={() => act("set_grant_status", g.id, "revoked")}>{t("Revoke")}</button>
                      : <button className="text-xs font-bold text-ok hover:underline" disabled={busy} onClick={() => act("set_grant_status", g.id, "active")}>{t("Reactivate")}</button>}
                    <button className="text-xs font-bold text-mute hover:underline ms-3" disabled={busy} onClick={() => act("delete_grant", g.id)}>{t("Delete")}</button>
                  </td>
                </tr>
              ))}
              {demo.grants.length === 0 && <tr><td colSpan="6" className="text-mute text-center py-6">{t("No demo access granted yet.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OwnerMailboxPanel({ mailbox }) {
  const t = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState(null);
  async function markRead(id) {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_mail_read", id }) });
    router.refresh();
  }
  return (
    <Card>
      <h3 className="font-display font-bold text-sm">{t("Owner Mailbox")}</h3>
      <p className="text-xs text-mute mt-1 mb-3">{t("Verification codes and system messages are delivered here securely. Codes are never shown to clients.")}</p>
      <div className="space-y-2">
        {mailbox.map((m) => (
          <div key={m.id} className={`rounded-lg border px-4 py-3 ${m.read ? "border-line bg-white" : "border-brand/40 bg-brand-soft/40"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{!m.read && <span className="inline-block h-2 w-2 rounded-full bg-brand me-1.5" />}{m.subject}</div>
                <div className="text-[0.68rem] text-mute">{new Date(m.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.code && (
                  <button
                    className="tnum rounded-lg bg-[#12263f] text-white font-extrabold px-3 py-1.5 tracking-[0.3em] text-sm"
                    onClick={() => { navigator.clipboard?.writeText(m.code); toast(t("Code copied")); if (!m.read) markRead(m.id); }}>
                    {m.code}
                  </button>
                )}
                {!m.read && <button className="text-xs font-bold text-brand hover:underline" onClick={() => markRead(m.id)}>{t("Mark read")}</button>}
              </div>
            </div>
            {openId === m.id && <pre className="mt-2 whitespace-pre-wrap text-xs text-mute bg-paper rounded-md p-3">{m.body}</pre>}
            <button className="mt-1.5 text-[0.68rem] font-bold text-mute hover:text-ink" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
              {openId === m.id ? t("Hide message") : t("View message")}
            </button>
          </div>
        ))}
        {mailbox.length === 0 && <div className="text-sm text-mute py-6 text-center">{t("No messages yet.")}</div>}
      </div>
    </Card>
  );
}
