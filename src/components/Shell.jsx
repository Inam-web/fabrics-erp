"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cls, Toaster } from "./ui";
import { LANGS } from "@/lib/i18n";
import { useT } from "@/lib/useT";

const NAV = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: "grid" },
  ]},
  { section: "Trade", items: [
    { href: "/sales", label: "Sales", icon: "receipt" },
    { href: "/purchases", label: "Purchases", icon: "truck" },
    { href: "/ograi", label: "Ograi / Collections", icon: "coins", hot: true },
    { href: "/customers", label: "Customers", icon: "users" },
    { href: "/suppliers", label: "Suppliers", icon: "factory" },
  ]},
  { section: "Stock", items: [
    { href: "/inventory", label: "Inventory", icon: "rolls" },
  ]},
  { section: "Money", items: [
    { href: "/expenses", label: "Expenses", icon: "spend" },
    { href: "/cashbank", label: "Cash & Bank", icon: "bank" },
    { href: "/cheques", label: "Cheques", icon: "cheque" },
    { href: "/reports", label: "Reports", icon: "chart" },
  ]},
  { section: "Admin", items: [
    { href: "/settings", label: "Settings & Staff", icon: "gear" },
  ]},
];

function Icon({ name }) {
  const p = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    truck: <><path d="M1 6h13v11H1z"/><path d="M14 10h4l4 4v3h-8"/><circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></>,
    coins: <><ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3V6"/><path d="M3 12v6c0 1.7 2.7 3 6 3s6-1.3 6-3v-6"/><path d="M18 9c2.2.4 4 1.4 4 2.8 0 1.2-1.3 2.2-3 2.7"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 15.2c2.8.3 4.9 2 5.5 4.8"/></>,
    factory: <><path d="M3 21V9l6 4V9l6 4V4h6v17H3z"/><path d="M17 8h2M17 12h2M17 16h2"/></>,
    rolls: <><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M7 8v8M11 8v8M15 8v8"/><circle cx="19" cy="12" r="1.6"/></>,
    spend: <><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M2 10h3M19 10h3"/></>,
    bank: <><path d="M3 9l9-6 9 6H3z"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 20h18"/></>,
    cheque: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h8M6 14h4"/><path d="M15 14l2 2 3.5-4"/></>,
    chart: <><path d="M4 20V6M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></>,
  }[name];
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p}</svg>;
}

function GlobalSearch({ businessName }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const h = (e) => { if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) { e.preventDefault(); ref.current?.focus(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const tm = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (r.ok) setRes(await r.json());
      } catch { /* ignore */ }
    }, 220);
    return () => clearTimeout(tm);
  }, [q]);

  const groups = res ? [
    ["Customers", res.customers, (x) => `/customers/${x.id}`],
    ["Invoices", res.invoices, (x) => `/sales/${x.id}`],
    ["Fabrics", res.products, () => `/inventory`],
    ["Receipts", res.receipts, (x) => `/customers?focus=${x.id}`],
    ["Suppliers", res.suppliers, (x) => `/suppliers/${x.id}`],
  ].filter(([, xs]) => xs?.length) : [];

  return (
    <div className="relative w-full max-w-md">
      <svg className="absolute left-2.5 top-2.5 text-mute rtl-flip-none" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ insetInlineStart: "0.625rem", insetInlineEnd: "auto", position: "absolute" }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={`${t("Search customer, invoice, fabric, phone…")}  ( / )`}
        className="inp pl-8 !bg-white/90 text-sm" style={{ paddingInlineStart: "2rem" }} />
      {open && q && res && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-line bg-card shadow-xl max-h-96 overflow-y-auto">
          {groups.length === 0 && <div className="px-3 py-3 text-sm text-mute">{t("No results")}</div>}
          {groups.map(([title, xs, href]) => (
            <div key={title}>
              <div className="px-3 pt-2 pb-1 text-[0.62rem] uppercase tracking-widest font-bold text-mute">{t(title)}</div>
              {xs.map((x) => (
                <button key={x.id} onMouseDown={() => { router.push(href(x)); setQ(""); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-brand-soft text-sm flex justify-between gap-2">
                  <span className="font-semibold truncate">{x.name}</span>
                  <span className="text-mute text-xs truncate tnum">{x.sub ?? ""}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Shell({ user, business, alerts, lang, children }) {
  const t = useT();
  const [mobileNav, setMobileNav] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const dangerCount = alerts.filter((a) => a.level === "danger").length;

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 py-2">
      {NAV.map((g) => (
        <div key={g.section} className="mb-3">
          <div className="px-2 pb-1 pt-2 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-night-text/45">{t(g.section)}</div>
          {g.items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} onClick={() => setMobileNav(false)}
                className={cls("flex items-center gap-2.5 rounded-md px-2 py-[0.42rem] text-[0.84rem] font-semibold transition-colors",
                  active ? "bg-brand text-white" : it.hot ? "text-[#e8c98a] hover:bg-night-2" : "text-night-text hover:bg-night-2")}>
                <Icon name={it.icon} />
                <span>{t(it.label)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <aside className="w-60 shrink-0 bg-night flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-night-line">
        <svg width="30" height="30" viewBox="0 0 34 34" fill="none"><rect x="1" y="1" width="32" height="32" rx="8" fill="#0d6b57"/><path d="M8 22c2.5-6 5-9 9-9s6.5 3 9 9" stroke="#f3f1e9" strokeWidth="2.2" strokeLinecap="round" fill="none"/><path d="M8 17.5c2.5-5 5-7.5 9-7.5s6.5 2.5 9 7.5" stroke="#7fc4a8" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8"/><circle cx="17" cy="24.5" r="1.8" fill="#f3f1e9"/></svg>
        <div className="min-w-0">
          <div className="font-display font-bold text-white text-[0.86rem] leading-tight truncate">{business.name}</div>
          <div className="text-[0.62rem] text-night-text/60 uppercase tracking-widest">{t("Wholesale ERP")}</div>
        </div>
      </div>
      {nav}
      <div className="border-t border-night-line p-3">
        <Link href="/sales/new" className="block rounded-md bg-accent hover:bg-[#9c660e] text-white text-center text-sm font-bold py-2 transition-colors">+ {t("New Sale")}</Link>
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="hidden lg:block no-print">{sidebar}</div>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 w-64 rtl:left-auto rtl:right-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-paper/95 backdrop-blur flex items-center gap-3 px-4 no-print">
          <button className="lg:hidden rounded border border-line bg-white p-1.5" onClick={() => setMobileNav(true)} aria-label={t("Overview")}>
            <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <GlobalSearch businessName={business.name} />
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative rounded-md border border-line bg-white p-2 hover:bg-paper" aria-label={t("Alerts & reminders")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 9a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.3 20a2 2 0 003.4 0"/></svg>
                {(alerts.length > 0) && <span className={cls("absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full text-[0.6rem] font-bold text-white flex items-center justify-center", dangerCount ? "bg-danger" : "bg-accent")}>{alerts.length}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 z-40 mt-1 w-96 max-w-[90vw] rounded-lg border border-line bg-card shadow-xl rtl:right-auto rtl:left-0">
                  <div className="px-3 py-2 border-b border-line font-display font-bold text-sm">{t("Alerts & reminders")}</div>
                  <div className="max-h-96 overflow-y-auto">
                    {alerts.length === 0 && <div className="px-3 py-4 text-sm text-mute">{t("All clear. No pending alerts.")}</div>}
                    {alerts.map((a, i) => (
                      <Link key={i} href={a.href || "#"} onClick={() => setNotifOpen(false)}
                        className={cls("block px-3 py-2.5 border-b border-line-soft hover:bg-paper", a.level === "danger" && "border-l-4 border-l-danger", a.level === "warn" && "border-l-4 border-l-accent")}>
                        <div className="text-sm font-semibold">{a.title}</div>
                        {a.body && <div className="text-xs text-mute mt-0.5">{a.body}</div>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <select className="inp !w-auto !py-1.5 text-xs" value={lang.code} aria-label="Language"
              onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div className="flex items-center gap-2 rounded-md border border-line bg-white pl-1 pr-2 py-1">
              <div className="h-7 w-7 rounded bg-brand text-white flex items-center justify-center text-xs font-bold">
                {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-xs font-bold">{user.name}</div>
                <div className="text-[0.62rem] uppercase tracking-wide text-mute">{user.role}</div>
              </div>
              <button title={t("Sign out")} onClick={async () => { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); router.push("/login"); }}
                className="text-mute hover:text-danger ml-1 rtl:ml-0 rtl:mr-1">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="rtl-flip"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" onClick={() => notifOpen && setNotifOpen(false)}>{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
