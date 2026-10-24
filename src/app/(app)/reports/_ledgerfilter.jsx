"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/useT";

// Keeps Type and Party selections in sync: switching the type immediately
// swaps the party options and resets the selection to the first entry,
// so a customer id can never be submitted while Supplier is selected.
export default function LedgerPartyFilter({ kind, partyId, customers, suppliers }) {
  const t = useT();
  const router = useRouter();
  const [k, setK] = useState(kind);
  const list = k === "supplier" ? suppliers : customers;
  const [pid, setPid] = useState(() => {
    const ids = (kind === "supplier" ? suppliers : customers).map((x) => x.id);
    return ids.includes(Number(partyId)) ? Number(partyId) : (ids[0] ?? "");
  });

  function changeKind(next) {
    setK(next);
    const ids = (next === "supplier" ? suppliers : customers).map((x) => x.id);
    setPid(ids[0] ?? "");
  }

  function apply() {
    router.push(`/reports?tab=ledger&view=party&kind=${k}&party=${pid}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 no-print">
      <div>
        <label className="text-[0.65rem] font-bold uppercase text-mute">{t("Type")}</label>
        <select className="inp mt-0.5" value={k} onChange={(e) => changeKind(e.target.value)}>
          <option value="customer">{t("Customer")}</option>
          <option value="supplier">{t("Supplier")}</option>
        </select>
      </div>
      <div>
        <label className="text-[0.65rem] font-bold uppercase text-mute">{k === "customer" ? t("Customer") : t("Supplier")}</label>
        <select className="inp mt-0.5 min-w-56" value={String(pid)} onChange={(e) => setPid(Number(e.target.value))}>
          {list.map((pp) => <option key={pp.id} value={pp.id}>{pp.name}</option>)}
        </select>
      </div>
      <button onClick={apply} className="rounded-lg bg-brand text-white text-sm font-bold px-4 py-2 hover:bg-brand-deep">{t("Filter")}</button>
    </div>
  );
}
