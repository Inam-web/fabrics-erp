"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/useT";
import { useLangCode } from "@/components/LangProvider";
import { LANGS } from "@/lib/i18n";
import LoginBackdrop from "@/components/LoginBackdrop";
import { BRAND } from "@/lib/brand.mjs";


export default function LoginPage() {
  const t = useT();
  const langCode = useLangCode();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState({ businessName: "", ownerName: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [dbIssue, setDbIssue] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [demoErr, setDemoErr] = useState("");
  const [info, setInfo] = useState("");
  const [regStep, setRegStep] = useState("form"); // form | verify
  const [vcode, setVcode] = useState("");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((d) => {
      if (d && d.db === false) {
        const tx = String(d.reason || "");
        setDbIssue(
          tx.includes("password authentication failed")
            ? "Database password mismatch — update .env & drizzle.config.json, then restart."
            : tx.includes("ECONNREFUSED")
            ? "PostgreSQL is not running — start it, then refresh."
            : `Database problem: ${tx}`
        );
      } else setDbIssue("");
    }).catch(() => {});
  }, []);

  async function enterDemo() {
    setBusy(true); setDemoErr("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "demo", code: demoCode }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Demo access failed");
      window.location.assign("/dashboard");
    } catch (ex) { setDemoErr(ex.message); setBusy(false); }
  }

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
    setBusy(true); setErr(""); setInfo("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.error || "Registration failed");
      if (res.status === 409) setInfo(data.error);
      else if (data.emailed === false) {
        setInfo(`${t("Your business was created and is awaiting verification.")} ${t("The code is in the owner's secure mailbox; external email delivery failed:")} ${data.emailError || ""}`);
      } else {
        setInfo(t("A 6-digit verification code was sent to the platform owner's email. The owner will share it with you after approving your registration. Enter it below to activate your business."));
      }
      setRegStep("verify");
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  }

  async function verifyBiz(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify_business", email: reg.email, code: vcode }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Verification failed");
      window.location.assign("/dashboard"); // verified → account opens
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  async function resendCode() {
    setBusy(true); setErr(""); setInfo("");
    try {
      const res = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend_verification", email: reg.email }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not resend");
      setInfo(t("A new verification code was sent to the platform owner's email."));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    await doLogin(email, password);
  }

  const setR = (k) => (e) => setReg({ ...reg, [k]: e.target.value });

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050f0b] text-emerald-50">
      <LoginBackdrop />

      {/* language selector */}
      <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 z-20 lf-fade">
        <select
          className="lf-select"
          value={langCode}
          aria-label="Language"
          onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}
        >
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.15fr_1fr] items-center gap-10 px-5 sm:px-10 lg:px-16 py-10">
        {/* brand story */}
        <div className="hidden lg:block max-w-xl">
          <div className="lf-up flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
            <img src={BRAND.mark} alt="" className="lf-float h-16 w-16 rounded-2xl shadow-[0_10px_40px_rgba(16,185,129,0.35)]" />
            <img src={BRAND.lockupLight} alt="AfridiTech — Wholesale Retail ERP" className="h-12 w-auto" />
          </div>
          <h1 className="lf-up font-display text-5xl font-bold leading-[1.08] text-white mt-10" style={{ animationDelay: "0.15s" }}>
            {t("Your registers, khata & ograi —")}<br />
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent">{t("in one system.")}</span>
          </h1>
          <p className="lf-up text-emerald-100/70 mt-5 leading-relaxed" style={{ animationDelay: "0.25s" }}>
            {t("Sales, customer khata, weekly ograi, supplier books, fabric stock, cash & bank, GST billing and profit & loss — connected, auditable, and built for the speed of a busy wholesale shop.")}
          </p>
          <div className="lf-up flex gap-3 mt-9" style={{ animationDelay: "0.35s" }}>
            {[["01", t("Billing")], ["02", t("Ograi / Collections")], ["03", t("Inventory")]].map(([n, label]) => (
              <div key={n} className="lf-glass rounded-xl px-4 py-3 min-w-28">
                <div className="text-[0.62rem] font-extrabold tracking-[0.25em] text-amber-200/80">{n}</div>
                <div className="text-sm font-bold text-emerald-50 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* glass panel */}
        <div className="lf-up lf-glass rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.55)] p-6 sm:p-8 w-full max-w-md mx-auto lg:mx-0 lg:ms-auto" style={{ animationDelay: "0.2s" }}>
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <img src={BRAND.mark} alt="" className="h-11 w-11 rounded-xl shadow-lg" />
            <div>
              <div className="font-display font-bold text-white">{BRAND.name}</div>
              <div className="text-[0.6rem] uppercase tracking-[0.28em] text-emerald-200/70 font-extrabold">{BRAND.name} ERP</div>
            </div>
          </div>

          {/* segmented tabs with sliding pill */}
          <div className="relative grid grid-cols-2 rounded-xl bg-white/5 border border-white/10 p-1 mb-6">
            <span
              className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-[0_6px_20px_rgba(16,185,129,0.35)] transition-transform duration-300 ease-out"
              style={{ transform: mode === "login" ? "translateX(0.25rem)" : "translateX(calc(100% + 0.25rem))", insetInlineStart: 0 }}
            />
            <button type="button" onClick={() => { setMode("login"); setErr(""); }}
              className={`relative z-10 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "login" ? "text-white" : "text-emerald-100/60 hover:text-emerald-50"}`}>
              {t("Sign in")}
            </button>
            <button type="button" onClick={() => { setMode("register"); setErr(""); }}
              className={`relative z-10 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "register" ? "text-white" : "text-emerald-100/60 hover:text-emerald-50"}`}>
              {t("Start your own business")}
            </button>
          </div>

          {dbIssue && (
            <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-400/10 text-amber-200 text-sm px-4 py-3 lf-fade">⚠ {dbIssue}</div>
          )}

          {mode === "login" ? (
            <form onSubmit={submit} key="login" className="lf-fade space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">{t("Welcome back")}</h2>
                <p className="text-sm text-emerald-100/60 mt-1">{t("Assalam-o-Alaikum — enter your account.")}</p>
              </div>
              <div className="space-y-3.5">
                <div>
                  <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Email")}</label>
                  <input className="lf-inp mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.pk" autoFocus />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Password")}</label>
                    <Link href="/reset" className="text-[0.68rem] font-bold text-amber-200/90 hover:text-amber-100">{t("Forgot password?")}</Link>
                  </div>
                  <div className="relative mt-1.5">
                    <input type={showPw ? "text" : "password"} className="lf-inp pe-11" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t("Hide password") : t("Show password")}
                      className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3 text-emerald-100/50 hover:text-emerald-50">
                      {showPw ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {err && <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 text-sm px-4 py-2.5 lf-fade">{err}</div>}
              <button type="submit" disabled={busy}
                className="lf-btn w-full rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 text-sm shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition-all duration-200 hover:shadow-[0_14px_40px_rgba(16,185,129,0.5)] active:translate-y-px disabled:opacity-60">
                {busy ? t("Saving…") : `${t("Sign in")} →`}
              </button>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mt-5">
                <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-amber-200/80 mb-1.5">{t("Client demo access")}</div>
                <p className="text-[0.7rem] text-emerald-100/50 mb-2.5">{t("Demo access is by invitation only. Enter the access code shared with you by the business owner.")}</p>
                <div className="flex gap-2">
                  <input className="lf-inp tnum" value={demoCode} onChange={(e) => setDemoCode(e.target.value)} placeholder="DEMO-XXXXXXXX" aria-label={t("Access code")} />
                  <button type="button" disabled={busy || !demoCode.trim()} onClick={enterDemo}
                    className="shrink-0 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-[#241503] font-bold px-4 text-sm disabled:opacity-50">
                    {t("Enter demo")}
                  </button>
                </div>
                {demoErr && <div className="mt-2 text-[0.72rem] text-red-300">{demoErr}</div>}
              </div>
            </form>
          ) : (
            regStep === "verify" ? (
              <form onSubmit={verifyBiz} key="verify" className="lf-fade space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">{t("Verify your business")}</h2>
                  <p className="text-sm text-emerald-100/60 mt-1">{info || t("Enter the 6-digit code shared with you by the platform owner.")}</p>
                </div>
                <div>
                  <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Verification code")}</label>
                  <input inputMode="numeric" maxLength={6} className="lf-inp mt-1.5 tnum text-center text-2xl tracking-[0.4em]" value={vcode}
                    onChange={(e) => setVcode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus />
                </div>
                {err && <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 text-sm px-4 py-2.5 lf-fade">{err}</div>}
                <button type="submit" disabled={busy || vcode.length !== 6}
                  className="lf-btn w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-[#241503] font-bold py-3 text-sm disabled:opacity-50">
                  {busy ? t("Saving…") : t("Verify & activate business")}
                </button>
                <div className="flex items-center justify-between text-[0.75rem] font-semibold">
                  <button type="button" onClick={() => { setRegStep("form"); setErr(""); setVcode(""); }} className="text-emerald-100/60 hover:text-emerald-50">{t("Back to registration")}</button>
                  <button type="button" onClick={resendCode} disabled={busy} className="text-amber-200 hover:text-amber-100 disabled:opacity-50">{t("Resend code")}</button>
                </div>
              </form>
            ) : (
            <form onSubmit={doRegister} key="register" className="lf-fade space-y-3.5">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">{t("Start your own business")}</h2>
                <p className="text-sm text-emerald-100/60 mt-1">{t("Fresh, empty books — everything zero. Add your own customers, fabrics and balances.")}</p>
              </div>
              <div>
                <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Business / shop name")}</label>
                <input className="lf-inp mt-1.5" value={reg.businessName} onChange={setR("businessName")} placeholder={t("e.g. Khan Fabric House")} autoFocus />
              </div>
              <div>
                <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Your name (owner)")}</label>
                <input className="lf-inp mt-1.5" value={reg.ownerName} onChange={setR("ownerName")} placeholder={t("e.g. Haji Aman Khan")} />
              </div>
              <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                <div>
                  <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Email")}</label>
                  <input className="lf-inp mt-1.5" value={reg.email} onChange={setR("email")} placeholder="you@yourbusiness.pk" />
                </div>
                <div>
                  <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Phone")}</label>
                  <input className="lf-inp mt-1.5" value={reg.phone} onChange={setR("phone")} placeholder="03xx-xxxxxxx" />
                </div>
              </div>
              <div>
                <label className="text-[0.66rem] font-extrabold uppercase tracking-[0.18em] text-emerald-200/70">{t("Password")}</label>
                <div className="relative mt-1.5">
                  <input type={showRegPw ? "text" : "password"} className="lf-inp pe-11" value={reg.password} onChange={setR("password")} placeholder={t("At least 6 characters")} />
                  <button type="button" onClick={() => setShowRegPw(!showRegPw)} aria-label={showRegPw ? t("Hide password") : t("Show password")}
                    className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3 text-emerald-100/50 hover:text-emerald-50">
                    {showRegPw ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </div>
              {err && <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 text-sm px-4 py-2.5 lf-fade">{err}</div>}
              <button type="submit" disabled={busy}
                className="lf-btn w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-[#241503] font-bold py-3 text-sm shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-all duration-200 active:translate-y-px disabled:opacity-60">
                {busy ? t("Saving…") : `${t("Create my business")} →`}
              </button>
            </form>
            )
          )}
        </div>
      </div>
    </div>
  );
}
