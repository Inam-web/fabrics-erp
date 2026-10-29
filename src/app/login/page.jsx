"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/useT";
import { useLangCode } from "@/components/LangProvider";
import { LANGS } from "@/lib/i18n";
import { BRAND } from "@/lib/brand.mjs";
import { BUSINESS_TYPES } from "@/lib/businessTypes";


export default function LoginPage() {
  const t = useT();
  const langCode = useLangCode();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState({ businessName: "", bizType: "fabric", ownerName: "", email: "", phone: "", address: "", password: "", confirm: "" });
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
    if (reg.password !== reg.confirm) { setErr(t("Passwords do not match")); setBusy(false); return; }
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

  // Shared field styling for the light, professional form surface.
  const inp = "w-full rounded-lg border border-[#e3dfd2] bg-white px-3.5 py-2.5 text-[0.9rem] text-[#1f241c] placeholder-[#b3b3a1] outline-none transition focus:border-[#0d6b57] focus:ring-[3px] focus:ring-[#0d6b57]/15";
  const lbl = "block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#68705f] mb-1.5";
  const feats = [t("Billing"), t("Ograi / Collections"), t("Inventory"), t("Reports"), t("Cash & Bank")];
  const bizTypes = Object.entries(BUSINESS_TYPES).map(([key, v]) => ({ key, label: v.label }));
  const bars = [26, 40, 30, 54, 38, 62, 46];

  return (
    <div className="min-h-screen w-full bg-[#eae7dd] text-[#1f241c] grid lg:grid-cols-[1.05fr_1fr] items-stretch">
      {/* ─────────────────────────  LEFT · sign-in surface  ───────────────────────── */}
      <div className="relative flex flex-col bg-white lg:bg-[#f4f3ee] px-5 sm:px-10 lg:px-16 py-7">
        {/* top bar: brand + language */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={BRAND.mark} alt="" className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-[#0d6b57]/15" />
            <div className="leading-tight">
              <div className="font-display font-bold text-[1.05rem] text-[#1f241c]">{BRAND.name}</div>
              <div className="text-[0.58rem] uppercase tracking-[0.28em] font-bold text-[#8b9080]">{BRAND.tagline}</div>
            </div>
          </div>
          <select
            className="rounded-lg border border-[#e3dfd2] bg-white px-3 py-1.5 text-xs font-bold text-[#1f241c] outline-none focus:border-[#0d6b57] focus:ring-[3px] focus:ring-[#0d6b57]/15"
            value={langCode}
            aria-label="Language"
            onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>

        {/* form area */}
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="w-full max-w-[420px]">
            {/* mobile brand line */}
            <div className="lg:hidden mb-6">
              <h1 className="font-display text-2xl font-bold text-[#1f241c]">{t("Your registers, khata & ograi —")} <span className="text-[#b97a12]">{t("in one system.")}</span></h1>
            </div>

            {/* segmented tabs */}
            <div className="relative grid grid-cols-2 rounded-xl border border-[#e3dfd2] bg-[#eae7dd] p-1 mb-7">
              <span
                className="absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#0d6b57] shadow-sm transition-transform duration-300 ease-out"
                style={{ transform: mode === "login" ? "translateX(0.25rem)" : "translateX(calc(100% + 0.25rem))", insetInlineStart: 0 }}
              />
              <button type="button" onClick={() => { setMode("login"); setErr(""); }}
                className={`relative z-10 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "login" ? "text-white" : "text-[#68705f] hover:text-[#1f241c]"}`}>
                {t("Sign in")}
              </button>
              <button type="button" onClick={() => { setMode("register"); setErr(""); }}
                className={`relative z-10 rounded-lg py-2 text-sm font-bold transition-colors ${mode === "register" ? "text-white" : "text-[#68705f] hover:text-[#1f241c]"}`}>
                {t("Start your own business")}
              </button>
            </div>

            {dbIssue && (
              <div className="mb-5 rounded-lg border border-[#e7c9a0] bg-[#fbf3e6] text-[#9c660e] text-sm px-4 py-3">⚠ {dbIssue}</div>
            )}

            {mode === "login" ? (
              <form onSubmit={submit} key="login" className="space-y-4">
                <div>
                  <h2 className="font-display text-[1.6rem] font-bold text-[#1f241c]">{t("Welcome back")}</h2>
                  <p className="text-sm text-[#68705f] mt-1">{t("Assalam-o-Alaikum — enter your account.")}</p>
                </div>
                <div>
                  <label className={lbl}>{t("Email")}</label>
                  <input className={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.pk" autoFocus />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#68705f]">{t("Password")}</label>
                    <Link href="/reset" className="text-[0.72rem] font-bold text-[#1f241c] hover:text-[#b97a12]">{t("Forgot password?")}</Link>
                  </div>
                  <div className="relative mt-1.5">
                    <input type={showPw ? "text" : "password"} className={inp + " pe-11"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? t("Hide password") : t("Show password")}
                      className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3 text-[#8b9080] hover:text-[#1f241c]">
                      {showPw ? (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-sm px-4 py-2.5">{err}</div>}
                <button type="submit" disabled={busy}
                  className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors active:translate-y-px disabled:opacity-60">
                  {busy ? t("Saving…") : `${t("Sign in")} →`}
                </button>

                <div className="rounded-xl border border-[#e3dfd2] bg-white p-4 mt-6">
                  <div className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#b97a12] mb-1">{t("Client demo access")}</div>
                  <p className="text-[0.72rem] text-[#68705f] mb-3">{t("Demo access is by invitation only. Enter the access code shared with you by the business owner.")}</p>
                  <div className="flex gap-2">
                    <input className={inp + " tnum"} value={demoCode} onChange={(e) => setDemoCode(e.target.value)} placeholder="DEMO-XXXXXXXX" aria-label={t("Access code")} />
                    <button type="button" disabled={busy || !demoCode.trim()} onClick={enterDemo}
                      className="shrink-0 rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold px-4 text-sm transition-colors disabled:opacity-50">
                      {t("Enter demo")}
                    </button>
                  </div>
                  {demoErr && <div className="mt-2 text-[0.72rem] text-[#b3402e]">{demoErr}</div>}
                </div>
              </form>
            ) : regStep === "verify" ? (
              <form onSubmit={verifyBiz} key="verify" className="space-y-4">
                <div>
                  <h2 className="font-display text-[1.6rem] font-bold text-[#1f241c]">{t("Verify your business")}</h2>
                  <p className="text-sm text-[#68705f] mt-1">{info || t("Enter the 6-digit code shared with you by the platform owner.")}</p>
                </div>
                <div>
                  <label className={lbl}>{t("Verification code")}</label>
                  <input inputMode="numeric" maxLength={6} className={inp + " tnum text-center text-2xl tracking-[0.4em]"} value={vcode}
                    onChange={(e) => setVcode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" autoFocus />
                </div>
                {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-sm px-4 py-2.5">{err}</div>}
                <button type="submit" disabled={busy || vcode.length !== 6}
                  className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors disabled:opacity-50">
                  {busy ? t("Saving…") : t("Verify & activate business")}
                </button>
                <div className="flex items-center justify-between text-[0.75rem] font-semibold">
                  <button type="button" onClick={() => { setRegStep("form"); setErr(""); setVcode(""); }} className="text-[#68705f] hover:text-[#1f241c]">{t("Back to registration")}</button>
                  <button type="button" onClick={resendCode} disabled={busy} className="text-[#b97a12] hover:text-[#9c660e] disabled:opacity-50">{t("Resend code")}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={doRegister} key="register" className="space-y-4">
                <div>
                  <h2 className="font-display text-[1.6rem] font-bold text-[#1f241c]">{t("Start your own business")}</h2>
                  <p className="text-sm text-[#68705f] mt-1">{t("Start with clean, empty books — everything at zero. Add your own customers, products and balances.")}</p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#0d6b57]">{t("Business details")}</span>
                  <span className="h-px flex-1 bg-[#e3dfd2]" />
                </div>
                <div>
                  <label className={lbl}>{t("Business / shop name")}</label>
                  <input className={inp} value={reg.businessName} onChange={setR("businessName")} placeholder={t("e.g. Khan Fabric House")} autoFocus />
                </div>
                <div>
                  <label className={lbl}>{t("Business type / trade")}</label>
                  <select className={inp} value={reg.bizType} onChange={setR("bizType")}>
                    {bizTypes.map((bt) => <option key={bt.key} value={bt.key}>{t(bt.label)}</option>)}
                  </select>
                  <p className="text-[0.72rem] text-[#8b9080] mt-1.5">{t("We tailor your inventory, units and reports to this trade.")}</p>
                </div>
                <div>
                  <label className={lbl}>{t("Business address")}</label>
                  <input className={inp} value={reg.address} onChange={setR("address")} placeholder={t("e.g. Main Bazaar, Mardan")} />
                  <p className="text-[0.72rem] text-[#8b9080] mt-1.5">{t("Optional — shop or warehouse address")}</p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#0d6b57]">{t("Owner account")}</span>
                  <span className="h-px flex-1 bg-[#e3dfd2]" />
                </div>
                <div>
                  <label className={lbl}>{t("Your name (owner)")}</label>
                  <input className={inp} value={reg.ownerName} onChange={setR("ownerName")} placeholder={t("e.g. Haji Aman Khan")} />
                </div>
                <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                  <div>
                    <label className={lbl}>{t("Email")}</label>
                    <input className={inp} value={reg.email} onChange={setR("email")} placeholder="you@yourbusiness.pk" />
                  </div>
                  <div>
                    <label className={lbl}>{t("Phone")}</label>
                    <input className={inp} value={reg.phone} onChange={setR("phone")} placeholder="03xx-xxxxxxx" />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-[#0d6b57]">{t("Security")}</span>
                  <span className="h-px flex-1 bg-[#e3dfd2]" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>{t("Password")}</label>
                    <div className="relative">
                      <input type={showRegPw ? "text" : "password"} className={inp + " pe-11"} value={reg.password} onChange={setR("password")} placeholder={t("At least 6 characters")} />
                      <button type="button" onClick={() => setShowRegPw(!showRegPw)} aria-label={showRegPw ? t("Hide password") : t("Show password")}
                        className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3 text-[#8b9080] hover:text-[#1f241c]">
                        {showRegPw ? (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        ) : (
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>{t("Confirm password")}</label>
                    <input type={showRegPw ? "text" : "password"} className={inp} value={reg.confirm} onChange={setR("confirm")} placeholder={t("Re-enter your password")} />
                  </div>
                </div>
                <p className="text-[0.72rem] text-[#8b9080] -mt-1">{t("Use at least 6 characters.")}</p>

                {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-sm px-4 py-2.5">{err}</div>}
                <button type="submit" disabled={busy}
                  className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors active:translate-y-px disabled:opacity-60">
                  {busy ? t("Saving…") : `${t("Create my business")} →`}
                </button>
                <p className="flex items-start justify-center gap-1.5 text-center text-[0.72rem] text-[#8b9080]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  <span>{t("Every new business is reviewed and verified by our team before it goes live.")}</span>
                </p>
              </form>
            )}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 text-[0.72rem] text-[#8b9080]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
          <span>© {new Date().getFullYear()} {BRAND.name}. {t("Secure sign-in")}.</span>
        </div>
      </div>

      {/* ─────────────────────────  RIGHT · product panel  ───────────────────────── */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden px-14 py-12 text-white"
        style={{
          backgroundColor: "#0a2018",
          backgroundImage:
            "radial-gradient(1100px 560px at 88% -12%, rgba(200,150,47,0.20), transparent 60%)," +
            "radial-gradient(820px 520px at 6% 112%, rgba(16,120,95,0.45), transparent 55%)," +
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 44px 44px, 44px 44px",
        }}
      >
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.32em] text-[#e8c98a]">{BRAND.tagline}</div>
          <h1 className="font-display text-[2.7rem] leading-[1.12] font-bold mt-5 max-w-[16ch]">
            {t("Your registers, khata & ograi —")} <span className="text-[#e8c98a]">{t("in one system.")}</span>
          </h1>
          <p className="text-[0.98rem] text-white/65 mt-5 max-w-[48ch] leading-relaxed">
            {t("Sales, customer khata, weekly ograi, supplier books, fabric stock, cash & bank, GST billing and profit & loss — connected, auditable, and built for the speed of a busy wholesale shop.")}
          </p>
        </div>

        {/* faux dashboard preview */}
        <div className="my-9 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-sm p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-bold text-[0.95rem]">{t("Dashboard")}</div>
            <span className="flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#e8c98a]" /> {t("live from your registers")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[[t("Revenue"), "1,284,500"], [t("Balance"), "342,180"], [t("Stock Value"), "2,910,400"]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="text-[0.6rem] uppercase tracking-[0.12em] text-white/45 font-bold truncate">{k}</div>
                <div className="tnum font-bold text-[1.02rem] mt-1">Rs {v}</div>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 260 70" className="w-full h-16 mt-4" preserveAspectRatio="none" aria-hidden>
            {bars.map((h, i) => (
              <rect key={i} x={i * 36 + 8} y={70 - h} width={20} height={h} rx={3}
                fill={i % 3 === 0 ? "#e8c98a" : "rgba(255,255,255,0.16)"} />
            ))}
          </svg>
          <div className="mt-4 space-y-1.5">
            {[["INV-24091", "62,400"], ["INV-24092", "18,900"]].map(([no, amt]) => (
              <div key={no} className="flex items-center justify-between text-[0.72rem] border-t border-white/[0.07] pt-1.5">
                <span className="tnum text-white/70">#{no}</span>
                <span className="tnum font-bold text-white/90">Rs {amt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* feature list */}
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {feats.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-white/80">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8c98a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                {f}
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-2 text-[0.72rem] text-white/45 border-t border-white/10 pt-5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            GST-ready · Multi-godown · Auditable day-closing
          </div>
        </div>
      </aside>
    </div>
  );
}
