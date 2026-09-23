"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, ErrorNote, toast } from "@/components/ui";
import { money, qtyFmt } from "@/lib/format";

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

export default function PurchaseForm({ suppliers, products, warehouses, accounts, defaultWarehouseId }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState(String(defaultWarehouseId));
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState("");
  const [discount, setDiscount] = useState("");
  const [extraCost, setExtraCost] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [accountId, setAccountId] = useState(String(accounts.find((a) => a.type === "bank")?.id || accounts[0]?.id || ""));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return products.filter((p) => (p.source || "wholesale") !== "retail" && (p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.color || "").toLowerCase().includes(t))).slice(0, 10);
  }, [q, products]);

  function add(p) {
    setLines((ls) => ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, color: p.color, unit: p.unit, qty: 50, rate: Number(p.costPrice) }]);
    setQ("");
  }

  const subtotal = r2(lines.reduce((a, l) => a + l.qty * l.rate, 0));
  const total = r2(subtotal - Math.min(Number(discount) || 0, subtotal) + (Number(extraCost) || 0));
  const paidNum = Math.min(Number(paid) || 0, total);

  async function save() {
    setErr("");
    if (!supplierId) return setErr("Select a supplier.");
    if (!lines.length) return setErr("Add at least one item.");
    setBusy(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId), warehouseId: Number(warehouseId), refNo, date: date || undefined,
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })),
          discount: Number(discount) || 0, extraCost: Number(extraCost) || 0,
          paid: paidNum, method, accountId: Number(accountId), notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Purchase ${data.purchaseNo} saved — stock updated, supplier khata credited`);
      router.push(`/purchases/${data.id}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="grid xl:grid-cols-[1fr_300px] gap-4">
      <div className="space-y-3 min-w-0">
        <div className="rounded-lg border border-line bg-card p-3 grid md:grid-cols-4 gap-3">
          <Field label="Supplier" required>
            <select className="inp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Select —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Receive into (godown)">
            <select className="inp" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Supplier invoice #"><input className="inp" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="MI/12345" /></Field>
          <Field label="Date"><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>

        <div className="rounded-lg border border-line bg-card p-3 relative">
          <input className="inp" placeholder="Search fabric to receive — name, SKU, color…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); add(matches[0]); } }} />
          {matches.length > 0 && (
            <div className="absolute z-30 mt-1 left-3 right-3 rounded-lg border border-line bg-card shadow-xl max-h-64 overflow-y-auto">
              {matches.map((p) => (
                <button key={p.id} onMouseDown={() => add(p)} className="w-full text-left px-3 py-2 hover:bg-brand-soft text-sm border-b border-line-soft flex justify-between">
                  <span className="font-semibold">{p.name} <span className="text-mute font-normal">{p.color} · {p.sku}</span></span>
                  <span className="tnum text-mute">cost {money(p.costPrice)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Total</th><th></th></tr></thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan="5" className="text-center text-mute py-8">No items — search above. Quantities are in meters.</td></tr>}
              {lines.map((l, i) => (
                <tr key={l.productId}>
                  <td className="font-semibold">{l.name}{l.color ? ` · ${l.color}` : ""}
                  </td>
                  <td className="num w-32">
                    <input type="number" min="0" step="0.5" className="inp !py-1 text-right tnum" value={l.qty}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
                  </td>
                  <td className="num w-28"><input type="number" min="0" className="inp !py-1 text-right tnum" value={l.rate}
                    onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x))} /></td>
                  <td className="num tnum font-bold">{money(r2(l.qty * l.rate))}</td>
                  <td><button className="text-mute hover:text-danger font-bold px-1" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-card p-4">
          <h3 className="font-display font-bold text-sm mb-2">Payment to supplier</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="tnum">{money(subtotal)}</span></div>
            <div className="flex justify-between items-center"><span className="text-mute">Discount</span>
              <input type="number" min="0" className="inp !w-28 !py-1 text-right tnum" value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} /></div>
            <div className="flex justify-between items-center" title="Delivery / transport / loading — folded into stock value (landed cost)">
              <span className="text-mute">Delivery / landing</span>
              <input type="number" min="0" className="inp !w-28 !py-1 text-right tnum" value={extraCost} placeholder="0" onChange={(e) => setExtraCost(e.target.value)} /></div>
            <div className="flex justify-between border-t border-line pt-1.5 font-bold text-base"><span>Total</span><span className="tnum">{money(total)}</span></div>
            <div className="flex justify-between items-center"><span className="font-bold">Paid now</span>
              <input type="number" className="inp !w-28 !py-1 text-right tnum" value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <select className="inp text-xs" value={method} onChange={(e) => setMethod(e.target.value)}>
                {["cash", "bank_transfer", "cheque", "online"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
              <select className="inp text-xs" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex justify-between font-bold text-danger border-t border-line pt-2"><span>Supplier khata (udhaar)</span><span className="tnum">{money(r2(total - paidNum))}</span></div>
          </div>
          <Field label="Notes"><input className="inp mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="mt-4 grid gap-2">
            <Button onClick={save} disabled={busy} className="justify-center">{busy ? "Saving…" : `Save Purchase — ${money(total)}`}</Button>
          </div>
          <ErrorNote error={err} />
        </div>
      </div>
    </div>
  );
}
