"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast } from "@/components/ui";
import { qtyFmt } from "@/lib/format";
import { useT } from "@/lib/useT";

export function InvoiceActions({ saleId, customerId, items, canOverride, sale, customerPhone, businessName }) {
  const t = useT();
  const [voidOpen, setVoidOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [retLines, setRetLines] = useState({});
  const [fmt, setFmt] = useState("a4");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function doPrint() {
    if (fmt === "thermal") {
      document.body.classList.add("thermal-print");
      setTimeout(() => document.body.classList.remove("thermal-print"), 2000);
    }
    window.print();
  }

  const waHref = useMemo(() => {
    if (!sale) return "#";
    const lines = [
      `Assalam-o-Alaikum${sale.customerName ? ` ${sale.customerName}` : ""},`,
      `Invoice ${sale.invoiceNo} (${sale.date})`,
      `Items: ${items.length} · Total: Rs ${Number(sale.total).toLocaleString()}`,
      Number(sale.paid) > 0 ? `Received: Rs ${Number(sale.paid).toLocaleString()}` : null,
      Number(sale.balance) > 0 ? `Balance (udhaar): Rs ${Number(sale.balance).toLocaleString()}` : "Fully paid — Shukriya!",
      `— ${businessName || ""}`,
    ].filter(Boolean).join("\n");
    return `https://wa.me/${String(customerPhone || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(lines)}`;
  }, [sale, items, businessName, customerPhone]);

  async function doVoid() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/sales/${saleId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "void", reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Invoice voided — stock and khata reversed");
      setBusy(false);
      setVoidOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function doReturn() {
    const lines = Object.entries(retLines).filter(([, v]) => Number(v.qty) > 0).map(([pid, v]) => ({ productId: Number(pid), qty: Number(v.qty), rate: Number(v.rate) }));
    if (!lines.length) return setErr("Enter a return quantity for at least one item.");
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "sale", saleId, customerId, lines, reason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Sales return ${data.returnNo} saved — stock restored, khata credited`);
      setBusy(false);
      setRetOpen(false); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="no-print">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="inp !w-auto !py-1.5 text-xs" value={fmt} onChange={(e) => setFmt(e.target.value)} title="Print format">
          <option value="a4">A4 / A5</option>
          <option value="thermal">80mm</option>
        </select>
        <Button variant="outline" onClick={doPrint}>🖨 {t("Print Invoice")}</Button>
        {customerPhone && (
          <a href={waHref} target="_blank" rel="noreferrer"
            className="rounded-md border border-line bg-white px-3.5 py-2 text-xs font-bold hover:border-brand">
            📲 {t("Invoice")} WhatsApp
          </a>
        )}
        <Button variant="outline" onClick={() => setRetOpen(true)}>{t("Sales Return")}</Button>
        {canOverride && <Button variant="danger" onClick={() => setVoidOpen(true)}>{t("Void Invoice")}</Button>}
      </div>

      <Modal open={voidOpen} onClose={() => setVoidOpen(false)} title="Void this invoice">
        <p className="text-sm text-mute">This reverses stock, khata balance and any payment received against this invoice. The invoice stays in history marked VOID. This is recorded in the audit log.</p>
        <div className="mt-3"><Field label="Reason" required><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate entry, wrong customer" /></Field></div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setVoidOpen(false)}>{t("Cancel")}</Button>
          <Button variant="danger" onClick={doVoid} disabled={busy || !reason.trim()}>{busy ? "Voiding…" : "Void invoice"}</Button>
        </div>
      </Modal>

      <Modal open={retOpen} onClose={() => setRetOpen(false)} title="Sales return — goods back to godown" wide>
        <table className="tbl">
          <thead><tr><th>Item</th><th className="num">Sold</th><th className="num">Return Qty</th><th className="num">Rate</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.productId}>
                <td className="font-semibold">{it.name}{it.color ? ` · ${it.color}` : ""}</td>
                <td className="num tnum">{qtyFmt(it.qty)} {it.unit}</td>
                <td className="num w-28">
                  <input type="number" min="0" max={it.qty} step="0.5" className="inp !py-1 text-right tnum"
                    value={retLines[it.productId]?.qty ?? ""}
                    onChange={(e) => setRetLines((m) => ({ ...m, [it.productId]: { qty: e.target.value, rate: it.rate } }))} />
                </td>
                <td className="num tnum">{Number(it.rate).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3"><Field label="Reason"><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. shade issue, wrong fabric" /></Field></div>
        <div className="mt-3"><ErrorNote error={err} /></div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={() => setRetOpen(false)}>{t("Cancel")}</Button>
          <Button onClick={doReturn} disabled={busy}>{busy ? "Saving…" : "Save return"}</Button>
        </div>
      </Modal>
    </div>
  );
}
