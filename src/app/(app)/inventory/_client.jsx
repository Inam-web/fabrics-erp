"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Field, Badge, ErrorNote, toast } from "@/components/ui";
import { money, qtyFmt, dtFmt } from "@/lib/format";
import { LabelDialog } from "@/components/Barcode";
import { useT } from "@/lib/useT";

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export default function InventoryClient({ products, byWarehouse, warehouses, movements }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState("stock");
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [viewMovFor, setViewMovFor] = useState(null);
  const [adjOpen, setAdjOpen] = useState(false);
  const [trfOpen, setTrfOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [labelFor, setLabelFor] = useState(null);

  const whQty = useMemo(() => {
    const m = {};
    for (const r of byWarehouse) m[`${r.productId}:${r.warehouseId}`] = Number(r.qty);
    return m;
  }, [byWarehouse]);

  const rows = useMemo(() => products.filter((p) => {
    const qty = Number(p.qty);
    if (onlyLow && !(qty <= Number(p.reorderLevel) && Number(p.reorderLevel) > 0)) return false;
    if (!q) return true;
    return `${p.name} ${p.color} ${p.design} ${p.sku} ${p.barcode} ${p.brand} ${p.hsn || ""}`.toLowerCase().includes(q.toLowerCase());
  }), [products, q, onlyLow]);

  const totalQty = rows.reduce((a, p) => a + Number(p.qty), 0);
  const totalValue = rows.reduce((a, p) => a + Number(p.stockValue), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        {[["stock", t("Products & Stock")], ["mov", t("Stock Movements")]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-bold border ${tab === k ? "bg-brand text-white border-brand" : "bg-white border-line hover:border-brand"}`}>{l}</button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAdjOpen(true)}>{t("Stock Adjustment")}</Button>
          <Button variant="outline" onClick={() => setTrfOpen(true)}>{t("Transfer Between Godowns")}</Button>
          <Button onClick={() => setNewOpen(true)}>{t("+ Add New Product")}</Button>
        </div>
      </div>

      {tab === "stock" ? (
        <>
          <div className="flex flex-wrap gap-2 items-center no-print">
            <input className="inp !w-72" placeholder={t("Search") + "…"} value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex items-center gap-1.5 text-sm font-semibold text-mute">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> {t("Below low-level limit")}
            </label>
            <div className="ml-auto text-xs text-mute tnum">{rows.length} products · {qtyFmt(totalQty)} units · value {money(totalValue)}</div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("Product")}</th><th>{t("Code")} / HSN</th><th>{t("Price")}</th>
                  {warehouses.map((w) => <th key={w.id} className="num">{w.name}</th>)}
                  <th className="num">{t("Total")}</th><th className="num">{t("Value")}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const qty = Number(p.qty);
                  const low = Number(p.reorderLevel) > 0 && qty <= Number(p.reorderLevel);
                  return (
                    <tr key={p.id} className={p.notForSale ? "opacity-60" : ""}>
                      <td>
                        <a href={`/inventory/${p.id}`} className="hover:underline">
                        <div className="font-semibold flex items-center gap-1.5">
                          {p.name}{p.color ? ` · ${p.color}` : ""}
                          {low && <Badge tone="danger">low</Badge>}
                          {p.notForSale && <Badge tone="mute">not for sale</Badge>}
                          {(p.source || "wholesale") === "retail" && <Badge tone="warn">{t("manual retail")}</Badge>}
                        </div>
                        <div className="text-[0.66rem] text-mute">{p.design} · {p.quality} · {p.productType}</div>
                        </a>
                      </td>
                      <td className="text-xs tnum text-mute">{p.sku}<br />{p.hsn ? `HSN ${p.hsn}` : p.barcode}</td>
                      <td className="text-xs tnum">
                        buy {money(p.costPrice)} / sell {money(p.wholesalePrice)}
                        {Number(p.minPrice) > 0 && <div className="text-[0.62rem] text-warn">min {money(p.minPrice)}</div>}
                        {Number(p.gstRate) > 0 && <div className="text-[0.62rem] text-accent">GST {p.gstRate}%</div>}
                      </td>
                      {warehouses.map((w) => {
                        const v = whQty[`${p.id}:${w.id}`] || 0;
                        return <td key={w.id} className={`num tnum ${v === 0 ? "text-mute" : ""}`}>{v ? qtyFmt(v) : "—"}</td>;
                      })}
                      <td className="num tnum font-bold">{qtyFmt(qty)}</td>
                      <td className="num tnum font-bold">{money(p.stockValue)}</td>
                      <td className="no-print whitespace-nowrap">
                        <button className="text-xs font-bold text-brand hover:underline" onClick={() => { setTab("mov"); setViewMovFor(p); }}>{t("history")}</button>
                        <button className="text-xs font-bold text-accent hover:underline ml-2" onClick={() => setLabelFor(p)}>{t("labels")}</button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={7 + warehouses.length} className="text-center py-10">
                    <div className="text-mute">No products yet.</div>
                    <Button className="mt-3" onClick={() => setNewOpen(true)}>{t("+ Add New Product")}</Button>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {viewMovFor && (
            <div className="flex items-center gap-2 text-sm">
              <Badge tone="brand">{viewMovFor.name} {viewMovFor.color}</Badge>
              <button className="text-xs font-bold text-mute hover:text-ink" onClick={() => setViewMovFor(null)}>clear filter ×</button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-line bg-card">
            <table className="tbl">
              <thead><tr><th>{t("Date")}</th><th>{t("Type")}</th><th>{t("Product")}</th><th>{t("Godown")}</th><th className="num">Change</th><th className="num">Prev → New</th><th>Ref</th><th>By / Reason</th></tr></thead>
              <tbody>
                {(viewMovFor ? movements.filter((m) => m.productId === viewMovFor.id) : movements).map((m) => (
                  <tr key={m.id}>
                    <td className="text-mute whitespace-nowrap text-xs">{dtFmt(m.date)}</td>
                    <td><Badge tone={["sale", "adjust_out", "damage", "transfer_out", "purchase_return"].includes(m.type) ? "danger" : "ok"}>{m.type.replace("_", " ")}</Badge></td>
                    <td className="font-semibold">{m.product}{m.color ? ` · ${m.color}` : ""}</td>
                    <td className="text-xs">{m.warehouse}</td>
                    <td className={`num tnum font-bold ${Number(m.qty) < 0 ? "text-danger" : "text-ok"}`}>{Number(m.qty) > 0 ? "+" : ""}{qtyFmt(m.qty)}</td>
                    <td className="num tnum text-mute text-xs">{qtyFmt(m.prevQty)} → {qtyFmt(m.newQty)}</td>
                    <td className="text-xs tnum">{m.refNo || "—"}</td>
                    <td className="text-xs text-mute">{m.userName || "system"}{m.reason ? ` · ${m.reason}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AdjustDialog open={adjOpen} onClose={() => setAdjOpen(false)} products={products} warehouses={warehouses} whQty={whQty} />
      <TransferDialog open={trfOpen} onClose={() => setTrfOpen(false)} products={products} warehouses={warehouses} whQty={whQty} />
      <NewProductDialog open={newOpen} onClose={() => setNewOpen(false)} warehouses={warehouses} />
      <LabelDialog open={!!labelFor} onClose={() => setLabelFor(null)} product={labelFor} />
    </div>
  );
}

function ProductSelect({ value, onChange, products }) {
  return (
    <select className="inp" value={value} onChange={onChange}>
      <option value="">— Select product —</option>
      {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.color ? ` · ${p.color}` : ""} ({p.sku})</option>)}
    </select>
  );
}

export function AdjustDialog({ open, onClose, products, warehouses, whQty, defaultProductId = "" }) {
  const router = useRouter();
  const [f, setF] = useState({ productId: defaultProductId, warehouseId: warehouses[0] ? String(warehouses[0].id) : "", direction: "out", qty: "", type: "adjust", reason: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const current = f.productId && f.warehouseId ? whQty[`${f.productId}:${f.warehouseId}`] || 0 : null;
  const valid = f.productId && f.warehouseId && Number(f.qty) > 0 && f.reason.trim().length > 0;

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "adjust", productId: Number(f.productId), warehouseId: Number(f.warehouseId), qtyDelta: (f.direction === "in" ? 1 : -1) * Number(f.qty), type: f.type, reason: f.reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Stock adjusted — new quantity ${qtyFmt(data.now)} ${products.find((p) => String(p.id) === f.productId)?.unit || ""}`);
      setF({ ...f, qty: "", reason: "" });
      setBusy(false);
      onClose(); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Stock adjustment (audited)">
      <div className="space-y-3">
        <Field label="Product" required><ProductSelect products={products} value={f.productId} onChange={set("productId")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Godown">
            <select className="inp" value={f.warehouseId} onChange={set("warehouseId")}>
              {warehouses.map((w, i) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <select className="inp" value={f.direction} onChange={set("direction")}>
              <option value="out">Stock OUT (−)</option><option value="in">Stock IN (+)</option>
            </select>
          </Field>
        </div>
        {current !== null && (
          <div className="text-xs text-mute">Current stock in this godown: <b className="tnum text-ink">{qtyFmt(current)}</b></div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" required><input type="number" min="0" step="0.25" className="inp tnum" value={f.qty} onChange={set("qty")} /></Field>
          <Field label="Type">
            <select className="inp" value={f.type} onChange={set("type")}>
              <option value="adjust">Adjustment / count correction</option>
              <option value="damage">Damage / loss</option>
              <option value="opening">Opening stock</option>
            </select>
          </Field>
        </div>
        <Field label="Reason (required — recorded in audit trail)" required>
          <input className="inp" value={f.reason} onChange={set("reason")} placeholder="e.g. physical count correction, water damage, sample given" />
        </Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !valid} title={valid ? "" : "Select product & godown, enter quantity and a reason"}>{busy ? "Saving…" : "Apply adjustment"}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function TransferDialog({ open, onClose, products, warehouses, whQty, defaultProductId = "" }) {
  const router = useRouter();
  const [f, setF] = useState({ productId: defaultProductId, from: warehouses[0] ? String(warehouses[0].id) : "", to: warehouses[1] ? String(warehouses[1].id) : "", qty: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const available = f.productId && f.from ? whQty[`${f.productId}:${f.from}`] || 0 : null;
  const valid = f.productId && f.from && f.to && Number(f.qty) > 0 && f.from !== f.to && available !== null && Number(f.qty) <= available;

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", productId: Number(f.productId), fromWarehouseId: Number(f.from), toWarehouseId: Number(f.to), qty: Number(f.qty) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Transfer ${data.refNo} done — OUT and IN movements recorded`);
      setF({ ...f, qty: "" });
      setBusy(false);
      onClose(); router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Transfer stock between godowns">
      <div className="space-y-3">
        <Field label="Product" required><ProductSelect products={products} value={f.productId} onChange={set("productId")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select className="inp" value={f.from} onChange={set("from")}>
              <option value="">—</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="To">
            <select className="inp" value={f.to} onChange={set("to")}>
              <option value="">—</option>{warehouses.filter((w) => String(w.id) !== f.from).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Quantity" required hint={available != null ? `Available at source: ${qtyFmt(available)}` : ""}>
          <input type="number" min="0" step="0.25" className="inp tnum" value={f.qty} onChange={set("qty")} />
        </Field>
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !valid} title={valid ? "" : "Pick product, two different godowns and a quantity within available stock"}>{busy ? "Transferring…" : "Transfer"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================= HiTech-style Add New Product =================
function NewProductDialog({ open, onClose, warehouses }) {
  const t = useT();
  const router = useRouter();
  const [more, setMore] = useState(true);
  const [f, setF] = useState({
    name: "", group: "", brand: "", color: "", design: "Plain", unit: "meter",
    costPrice: "", wholesalePrice: "",
    openingStock: "", openingWarehouse: warehouses[0]?.id || "",
    sku: "", widthIn: "", productType: "Fabric",
    retailPrice: "", vipPrice: "", minPrice: "", mrp: "",
    hsn: "", gstRate: "0", reorderLevel: "", saleDiscountPct: "",
    description: "", notForSale: false,
  });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setBool = (k) => (e) => setF({ ...f, [k]: e.target.checked });
  const valid = f.name.trim() && Number(f.wholesalePrice) > 0 && Number(f.costPrice) >= 0;

  async function save() {
    setBusy(true); setErr("");
    try {
      const payload = {
        name: f.name, sku: f.sku || undefined, brand: f.brand || undefined,
        fabricType: f.group || undefined, color: f.color, design: f.design, widthIn: f.widthIn,
        costPrice: Number(f.costPrice) || 0, wholesalePrice: Number(f.wholesalePrice) || 0,
        retailPrice: Number(f.retailPrice) || Number(f.wholesalePrice) || 0,
        vipPrice: Number(f.vipPrice) || Number(f.wholesalePrice) || 0,
        minPrice: Number(f.minPrice) || 0, mrp: Number(f.mrp) || 0,
        unit: f.unit, openingStock: Number(f.openingStock) || 0, warehouseId: f.openingWarehouse,
        hsn: f.hsn, gstRate: Number(f.gstRate) || 0, saleDiscountPct: Number(f.saleDiscountPct) || 0,
        reorderLevel: Number(f.reorderLevel) || 0, productType: f.productType,
        description: f.description, notForSale: f.notForSale, group: f.group || undefined,
      };
      const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${t("Save Product")}: ${f.name}${Number(f.openingStock) > 0 ? ` · ${t("Opening Stock")} ${f.openingStock} ${f.unit}` : ""}`);
      onClose(); router.refresh();
      setBusy(false);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const L = ({ children }) => <label className="block text-[0.66rem] font-bold uppercase tracking-wider text-mute mb-1">{children}</label>;
  const Sec = ({ title, sub, children }) => (
    <section className="rounded-lg border border-line bg-white p-4">
      <h4 className="font-display font-bold text-[0.95rem]">{title}</h4>
      {sub && <p className="text-xs text-mute mt-0.5 mb-3">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("Add New Product")} wide>
      <div className="space-y-4">
        <Sec title={t("Product Information")} sub={t("Enter the basic details used to identify this fabric in your shop.")}>
          <div className="space-y-3">
            <div>
              <L>{t("Product Name")} <span className="text-danger">*</span></L>
              <input className="inp" value={f.name} onChange={set("name")} placeholder="e.g. Wash & Wear Navy" autoFocus />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <L>{t("Fabric / Group")}</L>
                <input className="inp" list="fabric-groups" value={f.group} onChange={set("group")} placeholder={t("Select fabric / group")} />
                <datalist id="fabric-groups">
                  {["Wash & Wear", "Cotton", "Lawn", "Khaddar", "Karandi", "Boski", "Viscose", "Chiffon", "Velvet", "Latha", "Drill", "Polyester", "Slub"].map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div>
                <L>{t("Brand / Mill")}</L>
                <input className="inp" value={f.brand} onChange={set("brand")} placeholder="e.g. Crescent" />
              </div>
              <div>
                <L>{t("Color")}</L>
                <input className="inp" value={f.color} onChange={set("color")} placeholder="e.g. Navy" />
              </div>
              <div>
                <L>{t("Design")}</L>
                <select className="inp" value={f.design} onChange={set("design")}>{["Plain", "Self", "Embroidered", "Printed", "Jacquard", "Striped"].map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div>
                <L>{t("Selling Unit")} <span className="text-danger">*</span></L>
                <select className="inp" value={f.unit} onChange={set("unit")}>{["meter", "piece", "set", "kg"].map((u) => <option key={u} value={u}>{u === "meter" ? "Meter" : u}</option>)}</select>
              </div>
            </div>
          </div>
        </Sec>

        <Sec title={t("Main Pricing")} sub={t("These are the two prices normally used in your wholesale billing.")}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <L>{t("Purchase Price (PKR)")} <span className="text-danger">*</span></L>
              <input type="number" min="0" className="inp tnum" value={f.costPrice} onChange={set("costPrice")} placeholder="e.g. 850" />
            </div>
            <div>
              <L>{t("Wholesale Sale Price (PKR)")} <span className="text-danger">*</span></L>
              <input type="number" min="0" className="inp tnum" value={f.wholesalePrice} onChange={set("wholesalePrice")} placeholder="e.g. 950" />
            </div>
          </div>
          <div className="mt-3 rounded-md bg-paper border border-line-soft px-3 py-2 text-xs text-mute">
            {t("Purchase price = your buying cost. Wholesale sale price = your normal selling rate.")}
          </div>
        </Sec>

        <Sec title={t("Opening Stock")} sub={t("If this product is already in your shop, enter its current stock.")}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <L>{t("Opening Stock (Meter)")}</L>
              <input type="number" min="0" step="0.25" className="inp tnum" value={f.openingStock} onChange={set("openingStock")} placeholder="0" />
            </div>
            <div>
              <L>{t("Godown")}</L>
              <select className="inp" value={f.openingWarehouse} onChange={set("openingWarehouse")}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </div>
          </div>
        </Sec>

        <section className="rounded-lg border border-line bg-white">
          <button type="button" onClick={() => setMore(!more)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
            <span className="text-[0.7rem]">{more ? "▼" : "▶"}</span>
            <span className="font-display font-bold text-[0.95rem]">{t("More Details")}</span>
            <span className="text-xs text-mute">{t("Optional information")}</span>
          </button>
          {more && (
            <div className="px-4 pb-4 space-y-4 border-t border-line-soft pt-4">
              <div>
                <div className="text-[0.66rem] font-bold uppercase tracking-wider text-mute mb-2">{t("Identification")}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <L>{t("Item Code / SKU")}</L>
                    <input className="inp" value={f.sku} onChange={set("sku")} placeholder={t("Leave empty for automatic code")} />
                  </div>
                  <div>
                    <L>{t("Width (inches)")}</L>
                    <input type="number" className="inp tnum" value={f.widthIn} onChange={set("widthIn")} placeholder="e.g. 58" />
                  </div>
                  <div>
                    <L>{t("Product Type")}</L>
                    <select className="inp" value={f.productType} onChange={set("productType")}>{["Fabric", "Stitching", "Accessory", "Service", "General"].map((x) => <option key={x}>{x}</option>)}</select>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] font-bold uppercase tracking-wider text-mute mb-2">{t("Other Prices")}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><L>{t("Retail Price (PKR)")}</L><input type="number" className="inp tnum" value={f.retailPrice} onChange={set("retailPrice")} placeholder={t("Optional")} /></div>
                  <div><L>{t("VIP Price (PKR)")}</L><input type="number" className="inp tnum" value={f.vipPrice} onChange={set("vipPrice")} placeholder={t("Optional")} /></div>
                  <div><L>{t("Minimum Sale Price (PKR)")}</L><input type="number" className="inp tnum" value={f.minPrice} onChange={set("minPrice")} placeholder={t("Optional")} /></div>
                  <div><L>{t("M.R.P. (PKR)")}</L><input type="number" className="inp tnum" value={f.mrp} onChange={set("mrp")} placeholder={t("Optional")} /></div>
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] font-bold uppercase tracking-wider text-mute mb-2">{t("Tax & Stock Control")}</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div><L>{t("HSN / SAC Code")}</L><input className="inp" value={f.hsn} onChange={set("hsn")} placeholder="e.g. 5208" /></div>
                  <div><L>{t("GST Rate %")}</L><input type="number" step="0.5" className="inp tnum" value={f.gstRate} onChange={set("gstRate")} placeholder="0" /></div>
                  <div><L>{t("Low Stock Alert")}</L><input type="number" className="inp tnum" value={f.reorderLevel} onChange={set("reorderLevel")} placeholder="e.g. 20" /></div>
                  <div><L>{t("Sale Discount %")}</L><input type="number" step="0.5" className="inp tnum" value={f.saleDiscountPct} onChange={set("saleDiscountPct")} placeholder={t("Optional")} /></div>
                </div>
              </div>
              <div>
                <L>{t("Description / Notes")}</L>
                <textarea className="inp" rows="3" value={f.description} onChange={set("description")} placeholder={t("Optional notes about this product")} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.notForSale} onChange={setBool("notForSale")} />
                <span className="font-bold text-danger">{t("Not For Sale")}</span>
                <span className="text-mute">— {t("keep in stock but prevent billing")}</span>
              </label>
            </div>
          )}
        </section>

        <ErrorNote error={err} />
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-mute"><span className="text-danger">*</span> {t("Required fields")}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button onClick={save} disabled={busy || !valid} title={valid ? "" : t("Product name and prices are required")}>{busy ? t("Saving…") : t("Save Product")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
