"use client";
// In-page bulk CSV import. Deliberately lives INSIDE the Customers / Suppliers /
// Inventory pages (no extra sidebar module): pick a file (or paste rows), preview,
// confirm, and the server imports everything in one transaction with per-row skips.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, ErrorNote, toast, AppIcon } from "@/components/ui";
import { parseCsv, csvToObjects, templateCsv } from "@/lib/csv";
import { useT } from "@/lib/useT";

const SPECS = {
  customers: {
    title: "Import customers from CSV",
    columns: [
      { key: "name", label: "Business name" }, { key: "ownerName", label: "Owner name" },
      { key: "phone", label: "Phone" }, { key: "area", label: "Area" }, { key: "city", label: "City" },
      { key: "address", label: "Address" }, { key: "category", label: "Category" },
      { key: "priceLevel", label: "Price level" }, { key: "paymentTerms", label: "Payment terms" },
      { key: "creditLimit", label: "Credit limit" }, { key: "weeklyOgrai", label: "Weekly ograi" },
      { key: "openingBalance", label: "Opening balance" }, { key: "salesman", label: "Salesman" },
      { key: "notes", label: "Notes" },
    ],
    aliases: { "business name": "name", "customer": "name", "customer name": "name", "owner": "ownerName", "mobile": "phone", "contact": "phone", "ob": "openingBalance", "opening": "openingBalance" },
    sample: ["Shahi Cloth House", "Sanaullah Shah", "03001234567", "Peppi Gate", "Peshawar", "", "wholesale", "wholesale", "weekly", "200000", "15000", "45000", "", ""],
  },
  suppliers: {
    title: "Import suppliers from CSV",
    columns: [
      { key: "name", label: "Name" }, { key: "contactPerson", label: "Contact person" },
      { key: "phone", label: "Phone" }, { key: "city", label: "City" }, { key: "address", label: "Address" },
      { key: "category", label: "Category" }, { key: "paymentTerms", label: "Payment terms" },
      { key: "openingBalance", label: "Opening payable" }, { key: "notes", label: "Notes" },
    ],
    aliases: { "supplier": "name", "supplier name": "name", "mill": "category", "contact": "phone", "we owe": "openingBalance", "ob": "openingBalance" },
    sample: ["Kohinoor Mill", "Bilal Khan", "03111234567", "Peshawar", "", "mill", "monthly", "120000", ""],
  },
  products: {
    title: "Import products from CSV",
    columns: [
      { key: "name", label: "Name" }, { key: "sku", label: "SKU/Code" }, { key: "barcode", label: "Barcode" },
      { key: "color", label: "Color" }, { key: "brand", label: "Brand/Mill" }, { key: "unit", label: "Unit" },
      { key: "source", label: "Source" }, { key: "costPrice", label: "Cost price" },
      { key: "wholesalePrice", label: "Wholesale price" }, { key: "retailPrice", label: "Retail price" },
      { key: "reorderLevel", label: "Reorder level" }, { key: "openingQty", label: "Opening stock qty" },
      { key: "warehouse", label: "Godown" },
    ],
    aliases: { "item": "name", "product": "name", "fabric": "name", "cost": "costPrice", "rate": "wholesalePrice", "opening": "openingQty", "opening stock": "openingQty", "stock": "openingQty", "godown": "warehouse", "warehouse": "warehouse" },
    sample: ["Wash & Wear", "WW-BLUE-58", "", "Blue", "Nishat", "meter", "wholesale", "480", "560", "650", "50", "300", "Main Store"],
  },
};

export function ImportCsvButton({ entity }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><AppIcon name="up" /> {t("Import CSV")}</Button>
      <ImportDialog entity={entity} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function ImportDialog({ entity, open, onClose }) {
  const t = useT();
  const router = useRouter();
  const spec = SPECS[entity];
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  if (!spec) return null;

  const ingest = (text) => {
    setErr(""); setResult(null);
    try {
      const parsed = csvToObjects(parseCsv(text), spec.aliases);
      if (!parsed.length) { setErr(t("No data rows found — the file needs a header row plus at least one data row.")); setRows([]); return; }
      setRows(parsed);
    } catch {
      setErr(t("Could not read the file — save it as CSV (comma separated) and try again."));
    }
  };

  const onFile = async (f) => {
    if (!f) return;
    ingest(await f.text());
  };

  const downloadTemplate = () => {
    const csv = templateCsv(spec.columns, spec.sample);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${entity}-import-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, rows }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Import failed");
      setResult(j);
      toast(`${j.created} ${entity} imported${j.skipped?.length ? `, ${j.skipped.length} skipped` : ""}`, j.created ? "ok" : "warn");
      router.refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => { onClose(); setRows([]); setRaw(""); setResult(null); setErr(""); };

  return (
    <Modal open={open} onClose={close} title={t(spec.title)} wide>
      <div className="space-y-3">
        <div className="text-sm text-mute">
          {t("Prepare a sheet with these columns, then upload it (or paste the rows). Existing records are skipped — nothing is overwritten.")}
          <button className="ml-2 font-bold text-brand hover:underline" type="button" onClick={downloadTemplate}>{t("Download template")}</button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[0.7rem]">
          {spec.columns.map((c) => <span key={c.key} className="rounded bg-black/5 px-1.5 py-0.5 font-semibold">{c.label}</span>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>📄 {t("Choose CSV file")}</Button>
          <span className="text-xs text-mute">{t("or paste the CSV below")}</span>
        </div>
        <textarea
          className="inp font-mono !text-[0.72rem] min-h-28" rows={5}
          placeholder={`${spec.columns.map((c) => c.label).join(",")}\n${spec.sample.join(",")}`}
          value={raw} onChange={(e) => { setRaw(e.target.value); if (!e.target.value.trim()) setRows([]); }}
          onBlur={() => { if (raw.trim()) ingest(raw); }}
        />
        {raw.trim() && !rows.length && (
          <Button size="sm" variant="outline" onClick={() => ingest(raw)}>{t("Parse pasted rows")}</Button>
        )}
        {rows.length > 0 && (
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="bg-black/5 px-3 py-1.5 text-xs font-bold">{rows.length} {t("rows ready")} · {t("preview")} (5)</div>
            <div className="overflow-x-auto">
              <table className="tbl !text-[0.72rem]">
                <thead><tr>{spec.columns.slice(0, 6).map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{spec.columns.slice(0, 6).map((c) => <td key={c.key} className="whitespace-nowrap">{r[c.key] || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {result && (
          <div className="rounded-lg border border-line p-3 text-sm space-y-1.5">
            <div><Badge2 ok>{t("Imported")}: {result.created}</Badge2></div>
            {result.skipped?.length > 0 && (
              <div className="text-warn font-semibold">{result.skipped.length} {t("skipped")}:</div>
            )}
            {result.skipped?.slice(0, 8).map((s, i) => (
              <div key={i} className="text-xs text-mute">Row {s.row}{s.name ? ` — ${s.name}` : ""}: {t(s.reason) || s.reason}</div>
            ))}
            {result.skipped?.length > 8 && <div className="text-xs text-mute">… +{result.skipped.length - 8} more</div>}
            {result.problems?.length > 0 && result.problems.map((p, i) => (
              <div key={`p${i}`} className="text-xs text-warn">Row {p.row}: {p.reason}</div>
            ))}
          </div>
        )}
        <ErrorNote error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>{result ? t("Done") : t("Cancel")}</Button>
          <Button onClick={run} disabled={busy || !rows.length}>{busy ? t("Importing…") : `${t("Import")} ${rows.length || ""}`.trim()}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Badge2({ ok, children }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{children}</span>;
}
