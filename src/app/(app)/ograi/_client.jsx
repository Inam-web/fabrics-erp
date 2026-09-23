"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Badge, Modal, toast, ErrorNote } from "@/components/ui";
import { money, dateShort, daysBetween, title } from "@/lib/format";
import PaymentDialog from "@/components/PaymentDialog";
import { useT } from "@/lib/useT";

function statusOf(s, today) {
  const rem = Number(s.expected) - Number(s.collected);
  if (rem <= 0) return ["collected", "ok"];
  if (s.dueDate < today) return ["overdue", "danger"];
  if (Number(s.collected) > 0) return ["partial", "warn"];
  return ["pending", "mute"];
}

export default function OgraiBoard({ schedules, accounts, salesmen, today, summary, routes, canSchedule, receipts = [] }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState("week");
  const [paySchedule, setPaySchedule] = useState(null);
  const [adjSchedule, setAdjSchedule] = useState(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjErr, setAdjErr] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [genWeeks, setGenWeeks] = useState(1);
  const [genErr, setGenErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveAdjust() {
    setBusy(true); setAdjErr("");
    try {
      const res = await fetch("/api/ograi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "adjust_schedule", scheduleId: adjSchedule.id, expected: Number(adjAmount), reason: adjReason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Expected ograi adjusted to ${money(data.expected)} (audited)`);
      setBusy(false);
      setAdjSchedule(null); router.refresh();
    } catch (e) { setAdjErr(e.message); setBusy(false); }
  }

  const rows = useMemo(() => {
    let xs = schedules.map((s) => ({ ...s, st: statusOf(s, today), rem: Number(s.expected) - Number(s.collected) }));
    if (tab === "week") xs = xs.filter((s) => s.weekStart === summary.thisMonday);
    if (tab === "overdue") xs = xs.filter((s) => s.st[0] === "overdue");
    if (tab === "sm") { /* all, grouped below */ }
    return xs.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }, [schedules, tab, today, summary.thisMonday]);

  const bySalesman = useMemo(() => {
    const m = {};
    for (const s of schedules) {
      if (s.weekStart !== summary.thisMonday) continue;
      const key = s.salesmanName || "Unassigned";
      m[key] = m[key] || { expected: 0, collected: 0, customers: 0 };
      m[key].expected += Number(s.expected);
      m[key].collected += Number(s.collected);
      m[key].customers += 1;
    }
    return Object.entries(m);
  }, [schedules, summary.thisMonday]);

  const todaysDow = new Date(today + "T00:00:00").getDay();
  const todaysRoute = routes.filter((r) => r.dayOfWeek === todaysDow);

  async function generate() {
    setBusy(true); setGenErr("");
    try {
      const res = await fetch("/api/ograi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", weeks: genWeeks }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Collection schedule created for ${data.created} customer-weeks`);
      setGenOpen(false);
      setBusy(false);
      router.refresh();
    } catch (e) { setGenErr(e.message); setBusy(false); }
  }

  const CollectionRow = ({ s }) => {
    const overDays = s.dueDate < today ? daysBetween(s.dueDate, today) : 0;
    return (
      <tr className={s.st[0] === "overdue" ? "bg-danger-soft/40" : ""}>
        <td className="whitespace-nowrap text-mute">{dateShort(s.weekStart)}</td>
        <td>
          <Link href={`/customers/${s.customerId}`} className="font-semibold hover:text-brand">{s.customerName}</Link>
          <div className="text-[0.66rem] text-mute">{s.area || "—"} · {s.phone || ""}</div>
        </td>
        <td className="text-xs">{s.salesmanName || "—"}</td>
        <td className="num tnum">{money(s.expected)}</td>
        <td className="num tnum text-ok">{Number(s.collected) ? money(s.collected) : "—"}</td>
        <td className="num tnum font-bold">{s.rem > 0 ? money(s.rem) : "✓"}</td>
        <td className="num tnum">{overDays > 0 ? <span className="text-danger font-bold">{overDays}d</span> : "—"}</td>
        <td>
          <Badge tone={s.st[1]}>{t(s.st[0])}</Badge>
          <div className="text-[0.62rem] text-mute mt-0.5">{Number(s.manualWeekly) > 0 ? t("manual") : t("auto 10%")}</div>
        </td>
        <td className="no-print whitespace-nowrap">
          {s.rem > 0 && <Button size="sm" variant="outline" onClick={() => setPaySchedule(s)}>{t("Collect")}</Button>}
          {canSchedule && (
            <button className="text-xs font-bold text-mute hover:text-ink ml-2" title="Adjust expected amount"
              onClick={() => { setAdjSchedule(s); setAdjAmount(String(Number(s.expected))); setAdjReason(""); }}>
              {t("Adjust")}
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {[
          [t("Expected this week"), money(summary.weekExpected), "brand"],
          [t("Collected this week"), money(summary.weekCollected), "ok"],
          [t("Remaining"), money(Math.max(0, summary.weekExpected - summary.weekCollected)), "warn"],
          [t("Overdue (all)"), money(summary.overdueAmount), summary.overdueAmount > 0 ? "danger" : "ok"],
          [t("Overdue customers"), String(summary.overdueCount), summary.overdueCount > 0 ? "danger" : "ok"],
          [t("Collected today"), money(summary.todayCollected), "ok"],
          [t("Monthly expected"), money(summary.monthExpected), "ink"],
          [t("Monthly collected"), money(summary.monthCollected), "ok"],
        ].map(([l, v, t]) => (
          <div key={l} className="rounded-lg border border-line bg-card px-3 py-2.5">
            <div className="text-[0.62rem] uppercase tracking-wider font-bold text-mute">{l}</div>
            <div className={`tnum font-bold mt-0.5 ${t === "danger" ? "text-danger" : t === "ok" ? "text-ok" : t === "brand" ? "text-brand-deep" : ""}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 no-print">
        {[["week", t("This Week")], ["overdue", `${t("Overdue")} (${summary.overdueCount})`], ["sm", t("By Salesman")], ["all", t("All Schedules")]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-bold border transition-colors ${tab === k ? "bg-brand text-white border-brand" : "bg-white border-line hover:border-brand"}`}>{l}</button>
        ))}
        <div className="ml-auto flex gap-2">
          {canSchedule && <Button variant="outline" onClick={() => setGenOpen(true)}>{t("Schedule Collections")}</Button>}
          <Button variant="outline" onClick={() => window.print()}>🖨 {t("Print")}</Button>
        </div>
      </div>

      {tab === "sm" ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-line bg-card p-4">
            <h3 className="font-display font-bold text-sm mb-2">{t("Salesmen performance")}</h3>
            <table className="tbl">
              <thead><tr><th>Salesman</th><th className="num">Customers</th><th className="num">Expected</th><th className="num">Collected</th><th className="num">Rate</th></tr></thead>
              <tbody>
                {bySalesman.map(([name, v]) => {
                  const pct = v.expected > 0 ? Math.round(v.collected / v.expected * 100) : 0;
                  return (
                    <tr key={name}>
                      <td className="font-semibold">{name}</td>
                      <td className="num tnum">{v.customers}</td>
                      <td className="num tnum">{money(v.expected)}</td>
                      <td className="num tnum text-ok font-bold">{money(v.collected)}</td>
                      <td className="num"><Badge tone={pct >= 80 ? "ok" : pct >= 40 ? "warn" : "danger"}>{pct}%</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-line bg-card p-4">
            <h3 className="font-display font-bold text-sm mb-2">Today's routes ({new Date(today + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" })})</h3>
            {todaysRoute.length === 0 && <div className="text-sm text-mute">No routes defined for today. Define routes in Settings → Salesmen.</div>}
            {todaysRoute.map((r) => (
              <div key={r.id} className="border-b border-line-soft py-2">
                <div className="font-bold text-sm">{r.salesmanName}</div>
                <div className="text-xs text-mute">{r.areas}</div>
                <div className="text-xs mt-1 tnum">
                  Expected today from route customers: {money(summary.routeExpected[r.salesmanId] || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1fr_330px] gap-4 items-start">
          <div className="overflow-x-auto rounded-lg border border-line bg-card">
            <table className="tbl">
              <thead>
                <tr><th>{t("Week")}</th><th>{t("Customer")}</th><th>{t("Salesman")}</th><th className="num">{t("Expected")}</th><th className="num">{t("Collected")}</th><th className="num">{t("Remaining")}</th><th className="num">{t("Over")}</th><th>{t("Status")}</th><th className="no-print"></th></tr>
              </thead>
              <tbody>
                {rows.map((s) => <CollectionRow key={s.id} s={s} />)}
                {rows.length === 0 && <tr><td colSpan="9" className="text-center text-mute py-10">No outstanding balances — nothing pending this week.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* collected ograi — actual receipts this week */}
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm">{t("Collected this week")}</h3>
              <span className="tnum text-sm font-bold text-ok">{money(receipts.reduce((a, r) => a + Number(r.amount), 0))}</span>
            </div>
            <div className="text-[0.66rem] text-mute mb-2">Every receipt received since Monday — counted against each customer's weekly ograi.</div>
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {receipts.length === 0 && <div className="text-sm text-mute py-6 text-center">{t("Nothing collected yet this week.")}</div>}
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-line-soft pb-1.5">
                  <div>
                    <a href={`/customers/${r.customerId}`} className="font-semibold hover:text-brand">{r.customerName}</a>
                    <div className="text-[0.64rem] text-mute tnum">{r.receiptNo} · {dateShort(r.date)} · {title(r.method)}</div>
                  </div>
                  <div className="tnum font-bold">{money(r.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <PaymentDialog
        open={!!paySchedule}
        onClose={() => setPaySchedule(null)}
        party={{ id: paySchedule?.customerId, name: paySchedule?.customerName || "", kind: "customer", balance: paySchedule?.customerBalance || 0, phone: paySchedule?.phone }}
        accounts={accounts} salesmen={salesmen}
        schedule={paySchedule ? { ...paySchedule, expected: paySchedule.expected, collected: paySchedule.collected, weekStart: paySchedule.weekStart } : null}
        defaultDate={today}
      />

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate collection schedules">
        <p className="text-sm text-mute">
          General rule: every customer&apos;s expected weekly ograi = <b>10% of his current outstanding balance</b>.
          A manual weekly amount set on a customer overrides the 10% rule for that customer only.
          Expected entries are created for the selected weeks ahead — never duplicated, never overwritten.
        </p>
        <div className="mt-3">
          <label className="text-xs font-bold text-mute uppercase">Weeks ahead</label>
          <select className="inp mt-1" value={genWeeks} onChange={(e) => setGenWeeks(Number(e.target.value))}>
            <option value="1">This week only</option><option value="2">2 weeks</option><option value="4">4 weeks</option>
          </select>
        </div>
        <ErrorNote error={genErr} />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate"}</Button>
        </div>
      </Modal>

      <Modal open={!!adjSchedule} onClose={() => setAdjSchedule(null)} title={`Adjust expected ograi — ${adjSchedule?.customerName || ""}`}>
        {adjSchedule && (
          <div className="space-y-3">
            <div className="rounded-md bg-paper border border-line px-3 py-2 text-sm tnum">
              Week of {adjSchedule.weekStart} · currently expected {money(adjSchedule.expected)} · collected {money(adjSchedule.collected)}
            </div>
            <Field label="New expected amount (Rs)" required>
              <input type="number" min="0" step="100" className="inp tnum" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} autoFocus />
            </Field>
            <Field label="Reason (recorded in audit log)">
              <input className="inp" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. agreed weekly instalment with customer" />
            </Field>
            <ErrorNote error={adjErr} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjSchedule(null)}>Cancel</Button>
              <Button onClick={saveAdjust} disabled={busy || !Number(adjAmount)}>{busy ? "Saving…" : "Save adjustment"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
