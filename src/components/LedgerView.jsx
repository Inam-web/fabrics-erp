"use client";
import { useMemo, useState } from "react";
import { money, dateShort } from "@/lib/format";
import { Button } from "./ui";
import { useT } from "@/lib/useT";
import { BRAND } from "@/lib/brand.mjs";

const RANGES = [["all", "All history"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["year", "This year"]];

export default function LedgerView({ rows, party, kind, whatsappPhone, exportHref }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");

  const filtered = useMemo(() => {
    const base = q.trim() ? rows.filter((r) => String(r.desc).toLowerCase().includes(q.trim().toLowerCase())) : rows;
    if (range === "all") return base;
    const now = new Date();
    let from;
    if (range === "year") from = `${now.getFullYear()}-01-01`;
    else {
      const d = new Date(); d.setDate(d.getDate() - Number(range));
      from = d.toISOString().slice(0, 10);
    }
    return base.filter((r) => r.date >= from);
  }, [rows, range, q]);

  const totals = useMemo(() => ({
    debit: filtered.reduce((a, r) => a + Number(r.debit || 0), 0),
    credit: filtered.reduce((a, r) => a + Number(r.credit || 0), 0),
  }), [filtered]);

  const balance = Number(party.balance || 0);
  const whatsappMsg = useMemo(() => {
    const label = kind === "customer" ? "outstanding balance" : "payable balance";
    return encodeURIComponent(
      `Assalam-o-Alaikum ${party.name}.\nYour current ${label} with our store is Rs ${Math.abs(balance).toLocaleString()}.\n${kind === "customer" && party.weeklyOgrai > 0 ? `This week's expected ograi is Rs ${Number(party.weeklyOgrai).toLocaleString()}.\n` : ""}Shukriya.`
    );
  }, [party, balance, kind]);

  return (
    <div>
      <div className="hidden print:flex items-center gap-2 mb-3">
        <img src={BRAND.mark} alt="" className="h-8 w-8 rounded-md" />
        <span className="font-display font-bold">{BRAND.name} ERP</span>
        <span className="text-xs text-mute">· {new Date().toLocaleDateString()}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
        <input className="inp !w-56 text-xs" placeholder={t("Search") + "…"} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp !w-auto text-xs" value={range} onChange={(e) => setRange(e.target.value)}>
          {RANGES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {whatsappPhone && (
            <a className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-brand"
              href={`https://wa.me/${String(whatsappPhone).replace(/[^0-9]/g, "")}?text=${whatsappMsg}`} target="_blank" rel="noreferrer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm5 13.9c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.2 2.4 1.5 2.7 1.7.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .2 0 .7-.2 1.3z"/></svg>
              {t("WhatsApp balance")}
            </a>
          )}
          {exportHref && (
            <a className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-brand" href={exportHref}>{t("Export CSV")}</a>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>🖨 {t("Print Statement")}</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("Date")}</th><th>{t("Description")}</th>
              <th className="num">{t("Debit")}</th><th className="num">{t("Credit")}</th><th className="num">{t("Balance")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">{t("No transactions in this period.")}</td></tr>}
            {filtered.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-mute">{dateShort(r.date)}</td>
                <td>
                  {r.ref ? <a className="font-semibold hover:text-brand" href={r.ref}>{r.desc}</a> : <span className="font-semibold">{r.desc}</span>}
                  {r.kind === "opening" && <span className="ml-2 text-[0.65rem] uppercase font-bold text-mute bg-black/5 rounded px-1 py-0.5">opening</span>}
                </td>
                <td className="num tnum">{Number(r.debit) ? money(r.debit) : ""}</td>
                <td className="num tnum">{Number(r.credit) ? money(r.credit) : ""}</td>
                <td className="num tnum font-bold">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-bold">
              <td colSpan="2" className="!py-2">{t("Total")} ({filtered.length})</td>
              <td className="num tnum">{money(totals.debit)}</td>
              <td className="num tnum">{money(totals.credit)}</td>
              <td className="num tnum">{money(balance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
