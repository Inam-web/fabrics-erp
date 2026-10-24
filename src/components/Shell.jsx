"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cls, Toaster } from "./ui";
import { LANGS } from "@/lib/i18n";
import { useT } from "@/lib/useT";
import { BRAND, brandMark } from "@/lib/brand.mjs";

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

const TITLES = [
  ["/sales/new", "New Sale", "Sales"], ["/sales", "Sales", "Trade"], ["/purchases", "Purchases", "Trade"],
  ["/ograi", "Ograi / Collections", "Trade"], ["/customers", "Customers", "Trade"], ["/suppliers", "Suppliers", "Trade"],
  ["/inventory", "Inventory", "Stock"], ["/expenses", "Expenses", "Money"], ["/cashbank", "Cash & Bank", "Money"],
  ["/cheques", "Cheques", "Money"], ["/reports", "Reports", "Money"], ["/settings", "Settings & Staff", "Admin"],
  ["/dashboard", "Dashboard", "Overview"],
];

function Icon({ name, size = 17 }) {
  const p = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
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
    bell: <><path d="M18 9a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.3 20a2 2 0 003.4 0"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    out: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></>,
    chev: <><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></>,
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p}</svg>;
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
    }, 200);
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
      <span className="absolute top-1/2 -translate-y-1/2 text-mute pointer-events-none" style={{ insetInlineStart: "0.7rem" }}>
        <Icon name="search" size={15} />
      </span>
      <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={`${t("Search customer, invoice, fabric, phone…")}  ( / )`}
        className="inp !bg-white/80 text-sm" style={{ paddingInlineStart: "2.1rem" }} />
      {open && q.trim() && res && (
        <div className="fade-in absolute z-40 mt-1.5 w-full rounded-xl border border-line bg-card shadow-(--shadow-pop) max-h-96 overflow-y-auto">
          {groups.length === 0 && <div className="px-3 py-3 text-sm text-mute">{t("No results")}</div>}
          {groups.map(([title, xs, href]) => (
            <div key={title}>
              <div className="px-3 pt-2 pb-1 text-[0.62rem] uppercase tracking-widest font-extrabold text-mute">{t(title)}</div>
              {xs.map((x) => (
                <button key={x.id} onMouseDown={() => { router.push(href(x)); setQ(""); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-brand-soft text-sm flex justify-between gap-2 transition-colors">
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

export default function Shell({ user, business, alerts, lang, children, demoUsage }) {
  const t = useT();
  const [mobileNav, setMobileNav] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const dangerCount = alerts.filter((a) => a.level === "danger").length;

  useEffect(() => { setCollapsed(localStorage.getItem("faberp_sb") === "1"); }, []);
  useEffect(() => { localStorage.setItem("faberp_sb", collapsed ? "1" : "0"); }, [collapsed]);

  const title = TITLES.find(([p]) => pathname === p || pathname.startsWith(p + "/")) || ["", "Dashboard", "Overview"];

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2.5 py-2">
      {NAV.map((g) => (
        <div key={g.section} className="mb-2.5">
          {!collapsed && <div className="px-2.5 pb-1 pt-2 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-night-text/40">{t(g.section)}</div>}
          {collapsed && <div className="mx-2 my-2 border-t border-night-line" />}
          {g.items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href} onClick={() => setMobileNav(false)} title={collapsed ? t(it.label) : undefined}
                className={cls("relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.84rem] font-semibold transition-colors mb-0.5",
                  collapsed && "justify-center px-0",
                  active ? "bg-night-2 text-white" : it.hot ? "text-[#e8c98a] hover:bg-night-2" : "text-night-text/85 hover:bg-night-2 hover:text-white")}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-accent rtl:left-auto rtl:right-0 rtl:rounded-l" />}
                <span className="shrink-0"><Icon name={it.icon} /></span>
                {!collapsed && <span className="truncate">{t(it.label)}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <aside className={cls("shrink-0 bg-night flex flex-col h-full transition-all duration-200", collapsed ? "w-[4.4rem]" : "w-60")}>
      <div className={cls("flex items-center gap-2.5 px-4 h-14 border-b border-night-line", collapsed && "justify-center px-0")}>
        <img src={brandMark(business)} alt="" className="h-8 w-8 rounded-lg shrink-0 shadow-md" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-bold text-white text-[0.84rem] leading-tight truncate">{business.name}</div>
            <div className="text-[0.6rem] text-night-text/50 uppercase tracking-widest">{BRAND.name} ERP</div>
          </div>
        )}
      </div>
      {nav}
      <div className="border-t border-night-line p-2.5 space-y-1.5">
        <Link href="/sales/new" title={collapsed ? `+ ${t("New Sale")}` : undefined}
          className={cls("block rounded-lg bg-accent hover:bg-[#9c660e] text-white text-center text-sm font-bold py-2 transition-colors", collapsed && "px-0 text-base")}>
          {collapsed ? "+" : `+ ${t("New Sale")}`}
        </Link>
        <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? t("Expand") : t("Collapse")}
          className={cls("hidden lg:flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-night-text/60 hover:text-white hover:bg-night-2 transition-colors text-xs font-bold")}>
          <span className={cls("transition-transform", collapsed && "rotate-180 rtl:rotate-0")}><Icon name="chev" size={14} /></span>
          {!collapsed && t("Collapse")}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="hidden lg:block no-print">{sidebar}</div>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
          <div className="absolute inset-0 bg-black/50 fade-in" onClick={() => setMobileNav(false)} />
          <div className="drawer-in absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 w-64">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-card/90 backdrop-blur flex items-center gap-3 px-4 no-print">
          <img src={BRAND.mark} alt="" className="lg:hidden h-7 w-7 rounded-md" />
          <button className="lg:hidden rounded-lg border border-line bg-white p-2 hover:bg-paper transition-colors" onClick={() => setMobileNav(true)} aria-label={t("Overview")}>
            <Icon name="menu" size={16} />
          </button>
          <div className="hidden md:block leading-tight min-w-0">
            <div className="text-[0.62rem] uppercase tracking-widest font-extrabold text-mute">{t(title[2])}</div>
            <h1 className="font-display font-bold text-[0.95rem] truncate">{t(title[1])}</h1>
          </div>
          <div className="flex-1 flex justify-center px-2"><GlobalSearch businessName={business.name} /></div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative rounded-lg border border-line bg-white p-2 hover:bg-paper transition-colors" aria-label={t("Alerts & reminders")}>
                <Icon name="bell" size={16} />
                {(alerts.length > 0) && <span className={cls("absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full text-[0.6rem] font-bold text-white flex items-center justify-center", dangerCount ? "bg-danger" : "bg-accent")}>{alerts.length}</span>}
              </button>
              {notifOpen && (
                <div className="fade-in absolute right-0 rtl:right-auto rtl:left-0 z-40 mt-1.5 w-96 max-w-[90vw] rounded-xl border border-line bg-card shadow-(--shadow-pop)">
                  <div className="px-4 py-2.5 border-b border-line font-display font-bold text-sm">{t("Alerts & reminders")}</div>
                  <div className="max-h-96 overflow-y-auto">
                    {alerts.length === 0 && <div className="px-4 py-5 text-sm text-mute">{t("All clear. No pending alerts.")}</div>}
                    {alerts.map((a, i) => (
                      <Link key={i} href={a.href || "#"} onClick={() => setNotifOpen(false)}
                        className={cls("block px-4 py-2.5 border-b border-line-soft hover:bg-paper transition-colors", a.level === "danger" && "border-s-4 border-s-danger", a.level === "warn" && "border-s-4 border-s-accent")}>
                        <div className="text-sm font-semibold">{a.title}</div>
                        {a.body && <div className="text-xs text-mute mt-0.5">{a.body}</div>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <select className="inp !w-auto !py-1.5 text-xs font-bold" value={lang.code} aria-label="Language"
              onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-white ps-1.5 pe-2.5 py-1">
              <div className="h-7 w-7 rounded-md bg-brand text-white flex items-center justify-center text-xs font-bold">
                {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-xs font-bold">{user.name}</div>
                <div className="text-[0.6rem] uppercase tracking-wide text-mute font-extrabold">{user.role}</div>
              </div>
              <button title={t("Sign out")} onClick={async () => { await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) }); router.push("/login"); }}
                className="text-mute hover:text-danger ms-1 transition-colors">
                <span className="rtl-flip block"><Icon name="out" size={15} /></span>
              </button>
            </div>
          </div>
        </header>
        {user.role === "demo" && demoUsage && (
          <div className="no-print bg-[#0d1b2e] border-b border-[#1e3a5f] px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.72rem]">
            <span className="rounded-md bg-[#e8c98a] text-[#241503] font-extrabold uppercase tracking-[0.14em] px-2.5 py-1 text-[0.62rem] shadow-sm">Demo Mode</span>
            <span className="text-white font-bold">
              AfridiTech ERP
              <span className="ms-2 font-medium text-white/60">{t("demo environment — sample data only")}</span>
            </span>
            <span className="hidden md:inline-block h-4 w-px bg-white/15" />
            <span className="flex flex-wrap items-center gap-1.5">
              {Object.entries(demoUsage).map(([m, n]) => (
                <span key={m} className={`rounded-full px-2.5 py-0.5 font-bold tnum border ${n >= 5 ? "bg-red-500/15 text-red-300 border-red-400/40 line-through" : "bg-white/10 text-white/90 border-white/15"}`}>
                  {m} {n}/5
                </span>
              ))}
            </span>
            <span className="ms-auto text-white/70 font-semibold">{t("Entry limit reached? Existing data stays viewable.")}</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" onClick={() => notifOpen && setNotifOpen(false)}>{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
