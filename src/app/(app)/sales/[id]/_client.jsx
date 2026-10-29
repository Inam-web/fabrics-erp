"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, ErrorNote, toast, AppIcon } from "@/components/ui";
import { qtyFmt, dateFmt, money, waPhone } from "@/lib/format";
import { buildInvoicePdfBlob } from "@/lib/invoicePdf";
import { useT } from "@/lib/useT";

export function InvoiceActions({ saleId, customerId, items, canOverride, sale, customerPhone, businessName, invoiceData }) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [retLines, setRetLines] = useState({});
  const [fmt, setFmt] = useState("a4");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const router = useRouter();

  function doPrint() {
    if (fmt === "thermal") {
      document.body.classList.add("thermal-print");
      setTimeout(() => document.body.classList.remove("thermal-print"), 2000);
    }
    window.print();
  }

  const waText = useMemo(() => {
    if (!sale) return "";
    return [
      `Assalam-o-Alaikum${sale.customerName ? ` ${sale.customerName}` : ""},`,
      `Invoice ${sale.invoiceNo} · ${dateFmt(sale.date)}`,
      `Items: ${items.length} · Total: ${money(sale.total)}`,
      Number(sale.paid) > 0 ? `Received: ${money(sale.paid)}` : null,
      Number(sale.balance) > 0 ? `Balance (udhaar): ${money(sale.balance)}` : "Fully paid — Shukriya!",
      `— ${businessName || ""}`,
      "Invoice PDF attached.",
    ].filter(Boolean).join("\n");
  }, [sale, items, businessName]);
  const waHref = useMemo(() => `https://wa.me/${waPhone(customerPhone)}?text=${encodeURIComponent(waText)}`, [waText, customerPhone]);

  async function sendInvoiceWhatsApp() {
    if (!sale) return;
    // Open the customer's exact chat FIRST, synchronously in the click, so the browser never blocks it.
    window.open(waHref, "_blank", "noopener,noreferrer");
    // Then generate the invoice PDF and save it, so it's ready to attach with the paperclip.
    setWaBusy(true);
    try {
      if (invoiceData) {
        const blob = await buildInvoicePdfBlob(invoiceData);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `Invoice-${sale.invoiceNo}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        toast("Chat opened. Invoice PDF saved to Downloads — tap the paperclip in WhatsApp, choose it, then Send.");
      }
    } catch {
      toast("Chat opened with the invoice summary (PDF could not be generated).");
    }
    setWaBusy(false);
  }

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
        <Link href={`/reports?tab=ledger&kind=customer&party=${customerId}`} className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold shadow-sm hover:bg-[#f6f5ef]">{t("View Ledger")}</Link>
        {canOverride && <Button variant="outline" onClick={() => setEditOpen(true)}>{t("Edit Invoice")}</Button>}
        <Button variant="outline" onClick={doPrint}><AppIcon name="print" /> {t("Print Invoice")}</Button>
        {customerPhone && (
          <button onClick={sendInvoiceWhatsApp} disabled={waBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3.5 py-2 text-xs font-bold hover:border-brand disabled:opacity-60">
            {waBusy ? t("Preparing PDF…") : <><AppIcon name="phone" /> {t("Invoice")} WhatsApp</>}
          </button>
        )}
        <Button variant="outline" onClick={() => setRetOpen(true)}>{t("Sales Return")}</Button>
        {canOverride && <Button variant="danger" onClick={() => setVoidOpen(true)}>{t("Void Invoice")}</Button>}
      </div>

      <EditInvoiceModal open={editOpen} onClose={() => setEditOpen(false)} sale={sale} items={items} />
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

function EditInvoiceModal({ open, onClose, sale, items }) {
  const t = useT();
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [discount, setDiscount] = useState("");
  const [addId, setAddId] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      /* Stateful-dialog reset: seed editable lines/discount from props each time it opens. */
      /* eslint-disable react-hooks/set-state-in-effect */
      setLines(items.map((i) => ({ productId: i.productId, name: `${i.name}${i.color ? " " + i.color : ""}`, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount || 0), gstRate: Number(i.gstRate || 0) })));
      setDiscount(String(Number(sale.discount || 0)));
      setErr("");
      /* eslint-enable react-hooks/set-state-in-effect */
      fetch("/api/products").then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const gstOn = !!sale.gstMode && sale.gstMode !== "none";
  const lineTotal = (l) => r2(l.qty * l.rate - (l.discount || 0));
  const subtotal = r2(lines.reduce((a, l) => a + lineTotal(l), 0));
  const gstTotal = r2(lines.reduce((a, l) => a + (gstOn ? lineTotal(l) * (Number(l.gstRate) || 0) / 100 : 0), 0));
  const disc = r2(Math.min(Number(discount) || 0, subtotal));
  const total = r2(Math.max(0, subtotal - disc + gstTotal));

  function addLine() {
    const p = products.find((x) => String(x.id) === addId);
    if (!p) return;
    setLines((ls) => ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: `${p.name}${p.color ? " " + p.color : ""}`, qty: 1, rate: Number(p.wholesalePrice || 0), discount: 0, gstRate: Number(p.gstRate || 0) }]);
    setAddId("");
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate, discount: l.discount || 0 })), discount: Number(discount) || 0 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast(`${sale.invoiceNo} — ${t("updated")}`);
      onClose(); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${t("Edit Invoice")} — ${sale.invoiceNo}`} wide>
      <div className="flex items-end gap-2 mb-3">
        <div className="flex-1">
          <Field label={t("Add line")}>
            <select className="inp" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">— {t("Product")} —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.color ? ` ${p.color}` : ""} · {p.sku}</option>)}
            </select>
          </Field>
        </div>
        <Button variant="outline" onClick={addLine} disabled={!addId}>+ {t("Add line")}</Button>
      </div>
      <div className="overflow-x-auto tblwrap rounded-lg border border-line">
        <table className="tbl">
          <thead><tr><th>{t("Product")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Rate")}</th><th className="num">{t("Discount")}</th><th className="num">{t("Total")}</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.productId}>
                <td className="font-semibold">{l.name}</td>
                <td className="num w-24"><input type="number" min="0" step="0.25" className="inp !py-1 text-right tnum" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} /></td>
                <td className="num w-28"><input type="number" min="0" className="inp !py-1 text-right tnum" value={l.rate} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x))} /></td>
                <td className="num w-24"><input type="number" min="0" className="inp !py-1 text-right tnum" value={l.discount || ""} placeholder="0" onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, discount: Number(e.target.value) } : x))} /></td>
                <td className="num tnum font-bold">{lineTotal(l).toLocaleString()}</td>
                <td><button className="text-xs font-bold text-danger hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button></td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan="6" className="text-mute text-center py-6 text-xs">{t("Invoice must have at least one item")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-sm">
        <div className="flex items-center gap-2"><span className="text-mute">{t("Discount")}</span>
          <input type="number" min="0" className="inp !w-28 !py-1 text-right tnum" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
        <div className="ms-auto w-60 space-y-1">
          <div className="flex justify-between"><span className="text-mute">{t("Subtotal")}</span><span className="tnum">{subtotal.toLocaleString()}</span></div>
          {disc > 0 && <div className="flex justify-between"><span className="text-mute">{t("Discount")}</span><span className="tnum">- {disc.toLocaleString()}</span></div>}
          {gstTotal > 0 && (sale.gstMode === "inter"
            ? <div className="flex justify-between"><span className="text-mute">IGST</span><span className="tnum">{gstTotal.toLocaleString()}</span></div>
            : <>
              <div className="flex justify-between"><span className="text-mute">CGST</span><span className="tnum">{r2(gstTotal / 2).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-mute">SGST</span><span className="tnum">{r2(gstTotal / 2).toLocaleString()}</span></div>
            </>)}
          <div className="flex justify-between font-bold border-t border-line pt-1"><span>{t("Total")}</span><span className="tnum">{total.toLocaleString()}</span></div>
        </div>
      </div>
      <p className="text-[0.7rem] text-mute mt-3">{t("Saving re-syncs stock, the customer khata, outstanding balances, reports and the audit trail.")}</p>
      <div className="mt-3"><ErrorNote error={err} /></div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
        <Button onClick={save} disabled={busy || lines.length === 0}>{busy ? t("Saving…") : t("Save")}</Button>
      </div>
    </Modal>
  );
}
