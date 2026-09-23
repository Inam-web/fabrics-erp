"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { useT } from "@/lib/useT";
import { LabelDialog } from "@/components/Barcode";
import { AdjustDialog, TransferDialog } from "../_client";

export default function ProductActions({ product, warehouses, whQty }) {
  const t = useT();
  const [labels, setLabels] = useState(false);
  const [adj, setAdj] = useState(false);
  const [trf, setTrf] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 no-print">
      <Link href={`/sales/new?product=${product.id}`} className="rounded-md bg-accent hover:bg-[#9c660e] text-white text-sm font-bold px-4 py-2">+ {t("New Sale")}</Link>
      <Link href="/purchases/new" className="rounded-md bg-brand hover:bg-brand-deep text-white text-sm font-bold px-4 py-2">+ {t("New Purchase")}</Link>
      <Button variant="outline" onClick={() => setAdj(true)}>{t("Stock Adjustment")}</Button>
      <Button variant="outline" onClick={() => setTrf(true)}>{t("Transfer Between Godowns")}</Button>
      <Button variant="outline" onClick={() => setLabels(true)}>{t("labels")}</Button>

      <LabelDialog open={labels} onClose={() => setLabels(false)} product={product} />
      <AdjustDialog open={adj} onClose={() => setAdj(false)} products={[product]} warehouses={warehouses} whQty={whQty} defaultProductId={String(product.id)} />
      <TransferDialog open={trf} onClose={() => setTrf(false)} products={[product]} warehouses={warehouses} whQty={whQty} defaultProductId={String(product.id)} />
    </div>
  );
}
