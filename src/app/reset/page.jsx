"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand.mjs";
import { useT } from "@/lib/useT";
import { useLangCode } from "@/components/LangProvider";
import { LANGS } from "@/lib/i18n";

function EyeBtn({ shown, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3.5 text-[#8b9080] hover:text-[#1f241c] transition-colors">
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  );
}

// Professional 6-box one-time-code input with auto-advance, paste & backspace
function OtpInput({ value, onChange }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");
  function setAt(i, ch) {
    const next = digits.slice();
    next[i] = ch;
    onChange(next.join(""));
    if (ch && i < 5) refs.current[i + 1]?.focus();
  }
  return (
    <div className="flex gap-2 justify-between" dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          maxLength={1}
          value={d}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, "").slice(-1))}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (txt) { onChange(txt); refs.current[Math.min(txt.length, 5)]?.focus(); }
          }}
          className="h-14 w-full max-w-[3.4rem] rounded-xl border border-[#e3dfd2] bg-white text-center text-2xl font-extrabold tnum text-[#1f241c] outline-none transition-all focus:border-[#0d6b57] focus:ring-[3px] focus:ring-[#0d6b57]/15"
        />
      ))}
    </div>
  );
}

const STEPS = ["Email", "Code", "New password"];

export default function ResetPage() {
  const t = useT();
  const langCode = useLangCode();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState(null); // 'email' | 'mailbox'
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  // Shared field styling — kept identical to the login screen.
  const inp = "w-full rounded-lg border border-[#e3dfd2] bg-white px-3.5 py-2.5 text-[0.9rem] text-[#1f241c] placeholder-[#b3b3a1] outline-none transition focus:border-[#0d6b57] focus:ring-[3px] focus:ring-[#0d6b57]/15";
  const lbl = "block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#68705f] mb-1.5";

  async function requestCode(e) {
    e?.preventDefault();
    setBusy(true); setErr(""); setInfo("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forgot", email }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Request failed");
      setDelivery(d.delivery);
      if (d.delivery === "email") setInfo(`A 6-digit verification code has been emailed to ${email}. It expires in 10 minutes and can be used once.`);
      else setInfo("A one-time code has been issued. It is delivered to the business owner's secure in-app mailbox, and to your inbox when email (SMTP / Resend) is configured on this server. Enter the 6-digit code below to continue.");
      setStep(2);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  async function verifyAndContinue(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset_verify", code }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Invalid code");
      setStep(3);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  async function doReset(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", code, password: pw }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Reset failed");
      window.location.assign("/dashboard"); // account opens with the new password
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <div className="min-h-screen w-full bg-[#eae7dd] text-[#1f241c] flex flex-col px-5 sm:px-8 py-7">
      {/* top bar: brand + language (mirrors the login screen) */}
      <div className="mx-auto flex w-full max-w-[30rem] items-center justify-between gap-4">
        <Link href="/login" className="flex items-center gap-3">
          <img src={BRAND.mark} alt="" className="h-10 w-10 rounded-xl shadow-sm ring-1 ring-[#0d6b57]/15" />
          <div className="leading-tight">
            <div className="font-display font-bold text-[1.05rem] text-[#1f241c]">{BRAND.name}</div>
            <div className="text-[0.58rem] uppercase tracking-[0.28em] font-bold text-[#8b9080]">{BRAND.tagline}</div>
          </div>
        </Link>
        <select
          className="rounded-lg border border-[#e3dfd2] bg-white px-3 py-1.5 text-xs font-bold text-[#1f241c] outline-none focus:border-[#0d6b57] focus:ring-[3px] focus:ring-[#0d6b57]/15"
          value={langCode}
          aria-label="Language"
          onChange={(e) => { document.cookie = `faberp_lang=${e.target.value};path=/;max-age=31536000`; location.reload(); }}
        >
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* card */}
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[30rem]">
          <div className="rounded-2xl border border-[#e3dfd2] bg-white shadow-[0_16px_50px_rgba(31,36,28,0.10)] overflow-hidden">
            {/* step indicator */}
            <div className="flex items-center px-7 pt-7 pb-1">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = step > n;
                const active = step === n;
                return (
                  <div key={label} className={`flex items-center ${i < 2 ? "flex-1" : ""}`}>
                    <div className="flex items-center gap-2">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[0.72rem] font-extrabold transition-colors ${done ? "bg-[#b97a12] text-white" : active ? "bg-[#0d6b57] text-white ring-[3px] ring-[#0d6b57]/15" : "bg-[#eae7dd] text-[#8b9080]"}`}>
                        {done ? "✓" : n}
                      </div>
                      <span className={`text-[0.72rem] font-bold whitespace-nowrap ${active || done ? "text-[#1f241c]" : "text-[#8b9080]"}`}>{label}</span>
                    </div>
                    {i < 2 && <div className={`flex-1 h-[2px] mx-3 rounded ${done ? "bg-[#b97a12]" : "bg-[#eae7dd]"}`} />}
                  </div>
                );
              })}
            </div>

            <div className="px-7 pt-5 pb-7">
              {step === 1 && (
                <form onSubmit={requestCode} className="space-y-5">
                  <div>
                    <h1 className="font-display text-[1.4rem] font-bold text-[#1f241c]">{t("Forgot password")}</h1>
                    <p className="text-[0.82rem] text-[#68705f] mt-1.5 leading-relaxed">
                      Enter the email registered to this business. A single-use 6-digit code will be issued (valid for 10 minutes).
                    </p>
                  </div>
                  <div>
                    <label htmlFor="fp-email" className={lbl}>{t("Registered email")}</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 flex items-center ps-3.5 text-[#8b9080]">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m2 7 10 7 10-7" /></svg>
                      </span>
                      <input id="fp-email" type="email" className={inp + " ps-10"} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@yourbusiness.pk" autoFocus />
                    </div>
                  </div>
                  {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-[0.82rem] px-4 py-3">{err}</div>}
                  <button disabled={busy || !email.trim()} className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors active:translate-y-px disabled:opacity-50">
                    {busy ? t("Saving…") : t("Send verification code")}
                  </button>
                  <Link href="/login" className="block text-center text-[0.82rem] font-semibold text-[#68705f] hover:text-[#1f241c]">← {t("Back to sign in")}</Link>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={verifyAndContinue} className="space-y-5">
                  <div>
                    <h1 className="font-display text-[1.4rem] font-bold text-[#1f241c]">{t("Enter verification code")}</h1>
                    <p className="text-[0.82rem] text-[#68705f] mt-1.5">For <span className="font-bold text-[#1f241c]">{email}</span></p>
                  </div>

                  {delivery === "email" ? (
                    <div className="flex gap-2.5 rounded-lg border border-[#c3ddd0] bg-[#e2efe8] px-4 py-3 text-[0.8rem] text-[#0a4f41] leading-relaxed">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m2 7 10 7 10-7" /></svg>
                      <span>{info}</span>
                    </div>
                  ) : (
                    <div className="flex gap-2.5 rounded-lg border border-[#e5c98a] bg-[#fdf6e8] px-4 py-3 text-[0.8rem] text-[#7a5a10] leading-relaxed">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      <span>{info}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#68705f] mb-2">{t("6-digit code")}</label>
                    <OtpInput value={code} onChange={setCode} />
                  </div>

                  {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-[0.82rem] px-4 py-3">{err}</div>}
                  <button disabled={busy || code.length !== 6} className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors active:translate-y-px disabled:opacity-50">
                    {busy ? t("Saving…") : t("Verify code")}
                  </button>
                  <div className="flex items-center justify-between text-[0.8rem] font-semibold">
                    <button type="button" onClick={() => { setStep(1); setErr(""); setCode(""); }} className="text-[#68705f] hover:text-[#1f241c]">{t("Use a different email")}</button>
                    <button type="button" onClick={() => requestCode()} disabled={busy} className="text-[#b97a12] hover:text-[#9c660e] disabled:opacity-50">{t("Resend code")}</button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form onSubmit={doReset} className="space-y-5">
                  <div>
                    <h1 className="font-display text-[1.4rem] font-bold text-[#1f241c]">{t("Set a new password")}</h1>
                    <p className="text-[0.82rem] text-[#68705f] mt-1.5">Your account opens immediately with the new password; all other sessions are signed out.</p>
                  </div>
                  <div>
                    <label htmlFor="fp-pw" className={lbl}>{t("New password")}</label>
                    <div className="relative">
                      <input id="fp-pw" type={showPw ? "text" : "password"} className={inp + " pe-11"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("At least 6 characters")} autoFocus />
                      <EyeBtn shown={showPw} onClick={() => setShowPw(!showPw)} />
                    </div>
                  </div>
                  {err && <div className="rounded-lg border border-[#e6c3bd] bg-[#fbeceb] text-[#b3402e] text-[0.82rem] px-4 py-3">{err}</div>}
                  <button disabled={busy || pw.length < 6} className="lf-btn w-full rounded-lg bg-[#0d6b57] hover:bg-[#0a4f41] text-white font-bold py-3 text-sm transition-colors active:translate-y-px disabled:opacity-60">
                    {busy ? t("Saving…") : t("Reset password & open account")}
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-[0.72rem] text-[#8b9080] mt-5 leading-relaxed">
            Codes are single-use and expire in 10 minutes.<br />Delivered to the owner&apos;s secure mailbox, and to your inbox when email (SMTP / Resend) is configured.
          </p>
        </div>
      </div>
    </div>
  );
}
