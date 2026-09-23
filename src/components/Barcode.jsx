"use client";
import { useEffect, useState } from "react";
import { Modal, Button, Field } from "./ui";
import { money } from "@/lib/format";

// ---- Code 128-B generator (no dependencies) ----
const PATTERNS = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

export function Code128({ text, height = 34 }) {
  const clean = String(text).replace(/[^\x20-\x7E]/g, "");
  const values = [...clean].map((c) => c.charCodeAt(0) - 32);
  let checksum = 104; // Start B
  values.forEach((v, i) => { checksum += v * (i + 1); });
  checksum %= 103;
  const seq = [104, ...values, checksum, 106];
  let x = 0;
  const bars = [];
  for (const val of seq) {
    const widths = PATTERNS[val].split("").map(Number);
    for (let i = 0; i < widths.length; i++) {
      if (i % 2 === 0) bars.push({ x, w: widths[i] }); // even positions are bars
      x += widths[i];
    }
  }
  return (
    <svg width={x * 1.6} height={height} viewBox={`0 0 ${x} ${height}`} preserveAspectRatio="none" className="block">
      {bars.map((b, i) => <rect key={i} x={b.x} y="0" width={b.w} height={height} fill="#111" />)}
    </svg>
  );
}

// ---- Label sheet dialog ----
export function LabelDialog({ open, onClose, product }) {
  const [count, setCount] = useState(12);
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    if (open) document.body.classList.add("label-printing");
    else document.body.classList.remove("label-printing");
    return () => document.body.classList.remove("label-printing");
  }, [open]);

  if (!open || !product) return null;
  const code = product.barcode || product.sku;

  return (
    <Modal open={open} onClose={onClose} title={`Barcode labels — ${product.name}${product.color ? ` · ${product.color}` : ""}`} wide>
      <div className="flex flex-wrap items-end gap-3 mb-4 no-print">
        <Field label="Number of labels"><input type="number" min="1" max="120" className="inp !w-24 tnum" value={count} onChange={(e) => setCount(Math.min(120, Math.max(1, Number(e.target.value) || 1)))} /></Field>
        <label className="flex items-center gap-1.5 text-sm font-semibold pb-2">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price
        </label>
        <div className="ml-auto"><Button onClick={() => window.print()}>🖨 Print label sheet</Button></div>
      </div>
      <div className="label-sheet grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="border border-line rounded-md p-2 bg-white text-center">
            <div className="text-[0.62rem] font-bold uppercase tracking-wide truncate">{product.brand || "Afridi Fabrics"}</div>
            <div className="text-[0.72rem] font-bold truncate">{product.name}{product.color ? ` · ${product.color}` : ""}</div>
            <div className="text-[0.6rem] text-mute truncate">{product.design} {product.widthIn ? `· ${product.widthIn}"` : ""} · {product.sku}</div>
            <div className="flex justify-center my-1 overflow-hidden"><Code128 text={code} height={30} /></div>
            <div className="text-[0.6rem] tnum tracking-widest">{code}</div>
            {showPrice && <div className="text-[0.8rem] font-bold tnum">Rs {Number(product.mrp || product.wholesalePrice || 0).toLocaleString()}</div>}
          </div>
        ))}
      </div>
      <div className="text-[0.68rem] text-mute mt-3 no-print">Tip: print on sticky label sheets (A4). Barcodes are Code-128 and scan with any USB/mobile scanner.</div>
    </Modal>
  );
}
