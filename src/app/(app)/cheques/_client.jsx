"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, toast } from "@/components/ui";
import { money, dateShort } from "@/lib/format";
import { useT } from "@/lib/useT";

const STATUSES = ["pending", "deposited", "cleared", "bounced", "cancelled"];
const tone = { pending: "warn", deposited: "brand", cleared: "ok", bounced: "danger", cancelled: "mute" };

export default function ChequesClient({ cheques }) {
  const t = useT();
  const [filter, setFilter] = useState("all");
  const router = useRouter();
  const rows = cheques.filter((c) => filter === "all" || c.status === filter);

  async function setStatus(id, status) {
    const res = await fetch("/api/cheques", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const data = await res.json();
    if (!res.ok) return toast(data.error || "Failed", "err");
    toast(`Cheque marked ${status}`);
    router.refresh();
  }

  const sum = (xs) => xs.reduce((a, c) => a + Number(c.amount), 0);
  const inbound = cheques.filter((c) => c.direction === "in");
  const outbound = cheques.filter((c) => c.direction === "out");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {[
          ["Incoming (customers)", money(sum(inbound)), "ok"],
          ["Outgoing (suppliers)", money(sum(outbound)), "warn"],
          ["Pending clearance", String(cheques.filter((c) => ["pending", "deposited"].includes(c.status)).length), "brand"],
          ["Cleared", String(cheques.filter((c) => c.status === "cleared").length), "ok"],
          ["Bounced", String(cheques.filter((c) => c.status === "bounced").length), "danger"],
        ].map(([l, v, t]) => (
          <div key={l} className="rounded-lg border border-line bg-card px-3 py-2.5">
            <div className="text-[0.62rem] uppercase tracking-wider font-bold text-mute">{l}</div>
            <div className={`tnum font-bold text-lg ${t === "danger" ? "text-danger" : t === "ok" ? "text-ok" : ""}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 no-print flex-wrap">
        {["all", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold border capitalize ${filter === s ? "bg-brand text-white border-brand" : "bg-white border-line hover:border-brand"}`}>{s}</button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="tbl">
          <thead><tr><th>{t("Direction")}</th><th>{t("Account")}</th><th>{t("Bank")}</th><th>{t("Cheque")} #</th><th className="num">{t("Amount")}</th><th>{t("Date")}</th><th>{t("Expected")}</th><th>{t("Status")}</th><th>{t("Update")}</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Badge tone={c.direction === "in" ? "ok" : "warn"}>{c.direction === "in" ? "IN" : "OUT"}</Badge></td>
                <td className="font-semibold">{c.party || "—"}</td>
                <td className="text-xs">{c.bank || "—"}</td>
                <td className="tnum text-xs">{c.chequeNo || "—"}</td>
                <td className="num tnum font-bold">{money(c.amount)}</td>
                <td className="text-xs text-mute">{dateShort(c.issueDate)}</td>
                <td className="text-xs text-mute">{dateShort(c.expectedDate)}</td>
                <td><Badge tone={tone[c.status]}>{c.status}</Badge></td>
                <td>
                  <select className="inp !w-auto !py-1 text-xs" value={c.status} onChange={(e) => setStatus(c.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="9" className="text-center text-mute py-10">No cheques recorded. Cheques received via payments appear here automatically.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
