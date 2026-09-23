"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/useT";

export const cls = (...xs) => xs.filter(Boolean).join(" ");

export function Button({ children, variant = "primary", size = "md", className, ...rest }) {
  const v = {
    primary: "bg-brand hover:bg-brand-deep text-white border border-brand",
    outline: "bg-white hover:bg-paper border border-line text-ink",
    ghost: "bg-transparent hover:bg-black/5 text-ink border border-transparent",
    danger: "bg-danger hover:bg-[#963527] text-white border border-danger",
    accent: "bg-accent hover:bg-[#9c660e] text-white border border-accent",
  }[variant];
  const s = size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3.5 py-2";
  return (
    <button className={cls("rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap", v, s, className)} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className, pad = true }) {
  return <div className={cls("rounded-lg border border-line bg-card shadow-[0_1px_2px_rgba(35,39,30,0.05)]", pad && "p-4", className)}>{children}</div>;
}

export function Stat({ label, value, sub, tone }) {
  const toneCls = { danger: "text-danger", ok: "text-ok", warn: "text-warn", brand: "text-brand", ink: "text-ink" }[tone || "ink"];
  return (
    <Card pad={false} className="px-3.5 py-3">
      <div className="text-[0.66rem] uppercase tracking-[0.08em] font-bold text-mute">{label}</div>
      <div className={cls("tnum text-xl font-bold mt-1 leading-none", toneCls)}>{value}</div>
      {sub && <div className="text-[0.7rem] text-mute mt-1.5">{sub}</div>}
    </Card>
  );
}

export function Badge({ children, tone = "mute" }) {
  const t = {
    ok: "bg-ok-soft text-ok", danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn",
    brand: "bg-brand-soft text-brand-deep", mute: "bg-black/5 text-mute", accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={cls("inline-flex items-center rounded px-1.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide whitespace-nowrap", t)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[6vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cls("w-full rounded-xl bg-card border border-line shadow-2xl", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-display font-bold text-[0.95rem]">{title}</h3>
          <button onClick={onClose} className="text-mute hover:text-ink text-lg leading-none px-1" aria-label="Close">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required, hint }) {
  return (
    <div>
      <label className="text-[0.7rem] font-bold text-mute uppercase tracking-wide flex items-center gap-1">
        {label}{required && <span className="text-danger">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[0.68rem] text-mute mt-1">{hint}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, base = "" }) {
  return (
    <div className="flex gap-1 border-b border-line overflow-x-auto no-print">
      {tabs.map((t) => (
        <Link key={t.key} href={`${base}?tab=${t.key}`}
          className={cls("px-3 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors",
            active === t.key ? "border-brand text-brand-deep" : "border-transparent text-mute hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function EmptyState({ title, sub, action }) {
  return (
    <div className="text-center py-12">
      <div className="font-display font-bold">{title}</div>
      {sub && <div className="text-sm text-mute mt-1">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pager({ page, pages, base }) {
  const t = useT();
  if (pages <= 1) return null;
  const join = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center justify-between mt-3 text-sm no-print">
      <div className="text-mute text-xs">{t("Page")} {page} {t("of")} {pages}</div>
      <div className="flex gap-2">
        {page > 1 && <Link className="rounded border border-line bg-white px-3 py-1 text-xs font-semibold" href={`${base}${join}page=${page - 1}`}>← {t("Prev")}</Link>}
        {page < pages && <Link className="rounded border border-line bg-white px-3 py-1 text-xs font-semibold" href={`${base}${join}page=${page + 1}`}>{t("Next")} →</Link>}
      </div>
    </div>
  );
}

// ---------- toast ----------
export function toast(msg, tone = "ok") {
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { msg, tone, id: Math.random() } }));
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const { msg, tone, id } = e.detail;
      setItems((xs) => [...xs, { msg, tone, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
    };
    window.addEventListener("app-toast", h);
    return () => window.removeEventListener("app-toast", h);
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm no-print">
      {items.map((x) => (
        <div key={x.id} className={cls("toast-in rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg border",
          x.tone === "err" ? "bg-danger text-white border-danger" : x.tone === "warn" ? "bg-accent text-white border-accent" : "bg-night text-white border-night-line")}>
          {x.msg}
        </div>
      ))}
    </div>
  );
}

export function PrintButton({ label = "🖨 Print", variant = "outline", size = "sm" }) {
  return <Button variant={variant} size={size} onClick={() => window.print()}>{label}</Button>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-md px-3 py-2">{error}</div>;
}

export function statusTone(status) {
  return { collected: "ok", partial: "warn", pending: "mute", overdue: "danger", final: "brand", void: "danger", cleared: "ok", bounced: "danger", pending: "warn", deposited: "brand" }[status] || "mute";
}
