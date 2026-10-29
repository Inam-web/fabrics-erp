"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/useT";
import { money, compact } from "@/lib/format";

export const cls = (...xs) => xs.filter(Boolean).join(" ");

// ---------- shared inline SVG icons (emoji render inconsistently, especially in Naskh/RTL) ----------
const ICONS = {
  down: <path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" />,
  up: <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 20h16" />,
  print: <><path d="M6 9V3h12v6" /><rect x="6" y="13" width="12" height="8" rx="1" /><path d="M6 17H3v-5a2 2 0 012-2h14a2 2 0 012 2v5h-3" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  warn: <><path d="M12 3L2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" /></>,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  phone: <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.4 19.4 0 01-6-6A19.8 19.8 0 012.1 4.1 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 2 .7 2.9a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c1 .3 1.9.6 2.9.7a2 2 0 011.7 2z" />,
};
export function AppIcon({ name, size = 15, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// ---------- mini chart primitives (pure SVG, no dependencies) ----------
export function Spark({ points, tone = "brand", className }) {
  const stroke = { brand: "var(--color-brand)", ok: "var(--color-ok)", danger: "var(--color-danger)", warn: "var(--color-warn)", accent: "var(--color-accent)", ink: "var(--color-ink)" }[tone] || "var(--color-brand)";
  if (!points || points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const W = 100, H = 26;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 5)]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cls("w-full h-6", className)} aria-hidden>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill={stroke} opacity="0.1" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1].toFixed(1)} r="1.8" fill={stroke} />
    </svg>
  );
}

// count-up: animate a number toward its target when it changes (skips for reduced motion)
function useCountUp(target) {
  const [shown, setShown] = useState(null);
  const fromRef = useRef(null);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const from = fromRef.current;
    fromRef.current = target;
    if (from == null || from === target) return; // first paint shows the final value, no animation
    const t0 = performance.now(), dur = 550;
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setShown(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else setShown(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (target == null) return null;
  return shown ?? target;
}

export function Button({ children, variant = "primary", size = "md", className, ...rest }) {
  const v = {
    primary: "bg-brand hover:bg-brand-deep text-white border border-brand shadow-sm",
    outline: "bg-white hover:bg-[#f6f5ef] border border-line text-ink shadow-sm",
    ghost: "bg-transparent hover:bg-black/5 text-ink border border-transparent",
    danger: "bg-danger hover:bg-[#963527] text-white border border-danger shadow-sm",
    accent: "bg-accent hover:bg-[#9c660e] text-white border border-accent shadow-sm",
  }[variant];
  const s = size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3.5 py-2";
  return (
    <button
      className={cls(
        "rounded-lg font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        v, s, className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, pad = true }) {
  return (
    <div className={cls("rounded-xl border border-line bg-card shadow-(--shadow-card)", pad && "p-4", className)}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon, spark, num, fmt }) {
  const toneCls = { danger: "text-danger", ok: "text-ok", warn: "text-warn", brand: "text-brand-deep", ink: "text-ink", accent: "text-accent" }[tone || "ink"];
  const chip = { danger: "bg-danger-soft text-danger", ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", brand: "bg-brand-soft text-brand-deep", accent: "bg-accent-soft text-accent", ink: "bg-black/5 text-mute" }[tone || "ink"];
  const edge = { danger: "border-s-danger", ok: "border-s-ok", warn: "border-s-warn", brand: "border-s-brand", accent: "border-s-accent", ink: "border-s-line" }[tone || "ink"];
  // num + fmt animate the value; the server passes only serializable props (fmt is a name, not a function)
  const animated = useCountUp(num != null ? Number(num) : null);
  const disp = num != null ? ((fmt === "compact" ? compact : money)(animated ?? 0)) : value;
  return (
    <Card pad={false} className={cls("flex flex-col px-3.5 py-3 border-s-4 hover:shadow-(--shadow-pop) transition-shadow", edge)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[0.64rem] uppercase tracking-[0.08em] font-extrabold text-mute">{label}</div>
        {icon && <span className={cls("rounded-md p-1 -mt-0.5", chip)}>{icon}</span>}
      </div>
      <div className={cls("tnum text-[1.35rem] font-bold mt-1 leading-none", toneCls)}>{disp}</div>
      {/* fixed footer slots keep every Stat card the same height, with or without data */}
      <div className="mt-auto">
        <div className="h-6 mt-1.5">{spark && <Spark points={spark} tone={tone === "ink" || !tone ? "brand" : tone} />}</div>
        <div className="text-[0.7rem] text-mute mt-1 truncate leading-4 min-h-4">{sub}</div>
      </div>
    </Card>
  );
}

// ---------- client-side sortable table header ----------
export function SortHeader({ label, k, sort, dir, setSort, num }) {
  const active = sort === k;
  return (
    <th className={num ? "num" : undefined}>
      <button type="button" onClick={() => setSort(active && dir === "desc" ? { k, dir: "asc" } : { k, dir: "desc" })}
        className={cls("inline-flex items-center gap-1 uppercase tracking-[0.07em] font-extrabold text-[0.66rem] transition-colors", num && "flex-row-reverse", active ? "text-brand-deep" : "hover:text-brand-deep text-mute")}>
        {label}
        <svg width="9" height="12" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M4.5 1.5v9" opacity={active ? 1 : 0.3} />
          <path d={active && dir === "asc" ? "M1.5 5L4.5 1.5 7.5 5" : "M1.5 7L4.5 10.5 7.5 7"} opacity={active ? 1 : 0.35} />
        </svg>
      </button>
    </th>
  );
}

export function Badge({ children, tone = "mute" }) {
  const t = {
    ok: "bg-ok-soft text-ok", danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn",
    brand: "bg-brand-soft text-brand-deep", mute: "bg-black/5 text-mute", accent: "bg-accent-soft text-accent",
  }[tone];
  const dot = { ok: "bg-ok", danger: "bg-danger", warn: "bg-warn", brand: "bg-brand", mute: "bg-mute", accent: "bg-accent" }[tone];
  return (
    <span className={cls("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.66rem] font-extrabold uppercase tracking-wide whitespace-nowrap", t)}>
      <span className={cls("h-1.5 w-1.5 rounded-full", dot)} />
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[6vh] fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cls("modal-in w-full rounded-xl bg-card border border-line shadow-(--shadow-pop)", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-display font-bold text-[0.95rem]">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-mute hover:text-ink hover:bg-black/5 transition-colors" aria-label="Close">
            <AppIcon name="x" size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, required, hint }) {
  return (
    <div>
      <label className="text-[0.68rem] font-extrabold text-mute uppercase tracking-wide flex items-center gap-1">
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
    <div className="text-center py-14 fade-in">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-black/5 text-mute">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
        </svg>
      </div>
      <div className="font-display font-bold">{title}</div>
      {sub && <div className="text-sm text-mute mt-1 max-w-sm mx-auto">{sub}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cls("skel", className)} />;
}

export function Pager({ page, pages, base }) {
  const t = useT();
  if (pages <= 1) return null;
  const join = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center justify-between mt-3 text-sm no-print">
      <div className="text-mute text-xs font-semibold">{t("Page")} {page} {t("of")} {pages}</div>
      <div className="flex gap-2">
        {page > 1 && <Link className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-[#f6f5ef] transition-colors" href={`${base}${join}page=${page - 1}`}>← {t("Prev")}</Link>}
        {page < pages && <Link className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-[#f6f5ef] transition-colors" href={`${base}${join}page=${page + 1}`}>{t("Next")} →</Link>}
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
    <div className="fixed bottom-4 right-4 rtl:right-auto rtl:left-4 z-[100] space-y-2 max-w-sm no-print">
      {items.map((x) => (
        <div key={x.id} className={cls("toast-in flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-(--shadow-pop) border",
          x.tone === "err" ? "bg-danger text-white border-danger" : x.tone === "warn" ? "bg-accent text-white border-accent" : "bg-night text-white border-night-line")}>
          <AppIcon name={x.tone === "err" ? "x" : x.tone === "warn" ? "warn" : "check"} size={15} className="shrink-0 opacity-90" />
          {x.msg}
        </div>
      ))}
    </div>
  );
}

export function PrintButton({ label = "Print", variant = "outline", size = "sm" }) {
  return <Button variant={variant} size={size} onClick={() => window.print()}><AppIcon name="print" /> {label}</Button>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 text-sm text-danger bg-danger-soft border border-danger/25 rounded-lg px-3 py-2.5 fade-in">
      <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      <span>{error}</span>
    </div>
  );
}

export function statusTone(status) {
  return { collected: "ok", partial: "warn", pending: "mute", overdue: "danger", final: "brand", void: "danger", cleared: "ok", bounced: "danger", deposited: "brand" }[status] || "mute";
}
