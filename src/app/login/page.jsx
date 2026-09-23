"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/useT";
import { useLangCode } from "@/components/LangProvider";
import { LANGS } from "@/lib/i18n";

export default function LoginPage() {
  const t = useT();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState({ businessName: "", ownerName: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dbIssue, setDbIssue] = useState("");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((d) => {
      if (d && d.db === false) {
        const tx = String(d.reason || "");
        setDbIssue(
          tx.includes("password authentication failed")
            ? "Database password mismatch — the postgres password in your .env doesn't match your local PostgreSQL. Update .env and drizzle.config.json, restart, then refresh."
            : tx.includes("ECONNREFUSED")
            ? "PostgreSQL is not running. Start it (Docker: docker start faberp-pg), then refresh."
            : `Database problem: ${tx}`
        );
      } else setDbIssue("");
    }).catch(() => {});
  }, []);

  async function doLogin(em, pw) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: em, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      window.location.assign("/dashboard");
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  async function doRegister(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      window.location.assign("/dashboard");
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    await doLogin(email, password);
  }

  const setR = (k) => (e) => setReg({ ...reg, [k]: e.target.value });

  const langCode = useLangCode();

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 z-10">
        <select className="inp !w-auto !py-1.5 text-xs" value={langCode} aria-label="Language"
          onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
      <div className="hidden lg:flex flex-col justify-between bg-night text-night-text p-10">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="font-display text-white text-lg font-bold">{t("Wholesale Fabric ERP")}</div>
              <div className="text-xs text-night-text/70">{t("Billing · Khata · Ograi · Inventory · Accounts")}</div>
            </div>
          </div>
          <div className="mt-16 max-w-md">
            <h1 className="font-display text-4xl font-bold text-white leading-tight">
              {t("Your registers, khata & ograi —")}<br />
              <span className="text-[#7fc4a8]">{t("in one system.")}</span>
            </h1>
            <p className="mt-4 text-sm text-night-text/80 leading-relaxed">
              {t("Sales, customer khata, weekly ograi, supplier books, fabric stock, cash & bank, GST billing and profit & loss — connected, auditable, and built for the speed of a busy wholesale shop.")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-md text-xs">
          {[[t("Try the demo"), t("A fully seeded fabric wholesaler — sign in with a demo account")],
            [t("Start fresh"), t("Create your own business with empty, clean books")],
            [t("Own your data"), t("Every business is fully isolated from the others")]].map(([a, b]) => (
            <div key={a} className="rounded-lg border border-night-line bg-night-2 p-3">
              <div className="font-display font-semibold text-white">{a}</div>
              <div className="mt-1 text-night-text/70 leading-snug">{b}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <LogoMark />
            <div className="font-display font-bold">{t("Wholesale Fabric ERP")}</div>
          </div>

          {dbIssue && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger font-semibold">⚠ {dbIssue}</div>
          )}

          <div className="grid grid-cols-2 rounded-lg border border-line bg-card p-1 text-sm font-bold">
            <button onClick={() => { setMode("login"); setErr(""); }}
              className={`rounded-md py-2 transition-colors ${mode === "login" ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>
              {t("Sign in")}
            </button>
            <button onClick={() => { setMode("register"); setErr(""); }}
              className={`rounded-md py-2 transition-colors ${mode === "register" ? "bg-brand text-white" : "text-mute hover:text-ink"}`}>
              {t("Start your own business")}
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={submit} className="mt-5">
              <h2 className="font-display text-2xl font-bold">{t("Welcome back")}</h2>
              <p className="text-sm text-mute mt-1">{t("Assalam-o-Alaikum — enter your account.")}</p>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Email")}</label>
                  <input className="inp mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.pk" autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Password")}</label>
                  <input type="password" className="inp mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                {err && <div className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2">{err}</div>}
                <button disabled={busy} className="w-full rounded-md bg-brand hover:bg-brand-deep text-white font-semibold py-2.5 text-sm disabled:opacity-60 transition-colors">
                  {busy ? t("Saving…") : t("Sign in")}
                </button>
              </div>
              <div className="mt-6 rounded-lg border border-line bg-card p-3 text-xs text-mute">
                <div className="font-semibold text-ink mb-1.5">{t("Or explore the demo business (seeded with data)")}</div>
                <div className="grid gap-1 tnum">
                  <button type="button" disabled={busy} className="text-left hover:text-brand font-semibold disabled:opacity-50" onClick={() => { setEmail("owner@afridifabrics.pk"); setPassword("afridi123"); doLogin("owner@afridifabrics.pk", "afridi123"); }}>
                    {t("Owner")} · owner@afridifabrics.pk · afridi123
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={doRegister} className="mt-5">
              <h2 className="font-display text-2xl font-bold">{t("Start your own business")}</h2>
              <p className="text-sm text-mute mt-1">{t("Fresh, empty books — everything zero. Add your own customers, fabrics and balances.")}</p>
              <div className="mt-5 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Business / shop name")}</label>
                  <input className="inp mt-1" value={reg.businessName} onChange={setR("businessName")} placeholder={t("e.g. Khan Fabric House")} autoFocus />
                </div>
                <div>
                  <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Your name (owner)")}</label>
                  <input className="inp mt-1" value={reg.ownerName} onChange={setR("ownerName")} placeholder={t("e.g. Haji Aman Khan")} />
                </div>
                <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                  <div>
                    <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Email")}</label>
                    <input className="inp mt-1" value={reg.email} onChange={setR("email")} placeholder="you@yourbusiness.pk" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Phone")}</label>
                    <input className="inp mt-1" value={reg.phone} onChange={setR("phone")} placeholder="03xx-xxxxxxx" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-mute uppercase tracking-wide">{t("Password")}</label>
                  <input type="password" className="inp mt-1" value={reg.password} onChange={setR("password")} placeholder={t("At least 6 characters")} />
                </div>
                {err && <div className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2">{err}</div>}
                <button disabled={busy} className="w-full rounded-md bg-accent hover:bg-[#9c660e] text-white font-semibold py-2.5 text-sm disabled:opacity-60 transition-colors">
                  {busy ? t("Saving…") : t("Create my business")}
                </button>
                <div className="text-[0.68rem] text-mute leading-relaxed">
                  {t("You'll get: 1 godown (“Main Shop”), a cash account, expense categories, and owner access — fully separate from the demo business. You can add bank accounts, more godowns, staff and users anytime in Settings.")}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
      <rect x="1" y="1" width="32" height="32" rx="8" fill="#0d6b57" />
      <path d="M8 22c2.5-6 5-9 9-9s6.5 3 9 9" stroke="#f3f1e9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M8 17.5c2.5-5 5-7.5 9-7.5s6.5 2.5 9 7.5" stroke="#7fc4a8" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
      <circle cx="17" cy="24.5" r="1.8" fill="#f3f1e9" />
    </svg>
  );
}
