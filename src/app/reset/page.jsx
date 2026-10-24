"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand.mjs";
import { useT } from "@/lib/useT";

function EyeBtn({ shown, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 rtl:right-auto rtl:left-0 flex items-center px-3.5 text-[#8a97a8] hover:text-[#12263f] transition-colors">
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
          className="h-14 w-full max-w-[3.4rem] rounded-xl border border-[#d9dfe8] bg-white text-center text-2xl font-extrabold tnum text-[#12263f] outline-none transition-all focus:border-[#12263f] focus:ring-4 focus:ring-[#12263f]/10"
        />
      ))}
    </div>
  );
}

const STEPS = ["Email", "Code", "New password"];
const SMTP_SNIPPET = `# .env  — then restart the app
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="AfridiTech ERP <youraddress@gmail.com>"`;

export default function ResetPage() {
  const t = useT();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState(null); // 'email' | 'unconfigured' | 'none'
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(e) {
    e?.preventDefault();
    setBusy(true); setErr(""); setInfo("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forgot", email }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Request failed");
      setDelivery(d.delivery);
      if (d.delivery === "email") setInfo(`A 6-digit verification code has been sent to ${email}. It expires in 10 minutes and can be used once.`);
      else if (d.delivery === "unconfigured") setInfo("A code was generated, but this server has no email service configured yet — so it was NOT sent to your inbox. Add the SMTP settings below to .env, restart the app, then press “Resend code”. The server administrator can also read the current code in the server terminal.");
      else setInfo("If that email is registered, a verification code has been issued.");
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
    <div className="min-h-screen bg-[#f4f3ee] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="flex items-center gap-3 mb-7 justify-center">
          <img src={BRAND.mark} alt="" className="h-12 w-12 rounded-xl shadow-md" />
          <div>
            <div className="font-display font-bold text-[1.1rem] text-[#12263f] leading-tight">{BRAND.name}</div>
            <div className="text-[0.6rem] uppercase tracking-[0.28em] text-[#5c6b80] font-extrabold">{BRAND.name} ERP</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e3dfd2] bg-white shadow-[0_16px_50px_rgba(18,38,63,0.10)] overflow-hidden">
          {/* step indicator */}
          <div className="flex items-center px-7 pt-7 pb-1">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const active = step === n;
              return (
                <div key={label} className={`flex items-center ${i < 2 ? "flex-1" : ""}`}>
                  <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[0.72rem] font-extrabold transition-colors ${done ? "bg-[#0d6b57] text-white" : active ? "bg-[#12263f] text-white ring-4 ring-[#12263f]/12" : "bg-[#e8ecf1] text-[#9aa6b5]"}`}>
                      {done ? "✓" : n}
                    </div>
                    <span className={`text-[0.72rem] font-bold whitespace-nowrap ${active || done ? "text-[#12263f]" : "text-[#9aa6b5]"}`}>{label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-[2px] mx-3 rounded ${done ? "bg-[#0d6b57]" : "bg-[#e8ecf1]"}`} />}
                </div>
              );
            })}
          </div>

          <div className="px-7 pt-5 pb-7">
            {step === 1 && (
              <form onSubmit={requestCode} className="space-y-5">
                <div>
                  <h1 className="font-display text-[1.35rem] font-bold text-[#12263f]">{t("Forgot password")}</h1>
                  <p className="text-[0.82rem] text-[#5c6b80] mt-1.5 leading-relaxed">
                    Enter the email registered to this business. A single-use 6-digit code will be sent to it (valid 10 minutes).
                  </p>
                </div>
                <div>
                  <label htmlFor="fp-email" className="block text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#5c6b80] mb-1.5">{t("Registered email")}</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 flex items-center ps-3.5 text-[#9aa6b5]">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m2 7 10 7 10-7" /></svg>
                    </span>
                    <input id="fp-email" type="email" className="nv-inp ps-10 h-11 text-[0.95rem]" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@yourbusiness.pk" autoFocus />
                  </div>
                </div>
                {err && <div className="rounded-xl border border-[#e8b4a8] bg-[#fbeeea] text-[#8c3322] text-[0.82rem] px-4 py-3">{err}</div>}
                <button disabled={busy || !email.trim()} className="lf-btn w-full rounded-xl bg-[#12263f] text-white font-bold h-11 text-[0.9rem] disabled:opacity-50 hover:bg-[#1b3557] transition-colors">
                  {busy ? t("Saving…") : t("Send verification code")}
                </button>
                <Link href="/login" className="block text-center text-[0.82rem] font-semibold text-[#5c6b80] hover:text-[#12263f]">← {t("Back to sign in")}</Link>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={verifyAndContinue} className="space-y-5">
                <div>
                  <h1 className="font-display text-[1.35rem] font-bold text-[#12263f]">{t("Enter verification code")}</h1>
                  <p className="text-[0.82rem] text-[#5c6b80] mt-1.5">For <span className="font-bold text-[#12263f]">{email}</span></p>
                </div>

                {delivery === "email" && (
                  <div className="rounded-xl border border-[#bcd9c6] bg-[#e9f5ee] px-4 py-3 text-[0.8rem] text-[#1d5c38] leading-relaxed">{info}</div>
                )}
                {delivery === "unconfigured" && (
                  <div className="rounded-xl border border-[#e5c98a] bg-[#fdf6e8] px-4 py-3.5">
                    <div className="text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-[#7a5a10]">{t("Email delivery not configured")}</div>
                    <p className="text-[0.78rem] text-[#7a5a10] mt-1.5 leading-relaxed">{info}</p>
                    <pre className="mt-2.5 rounded-lg bg-[#12263f] text-[#cfe3d8] text-[0.68rem] leading-relaxed p-3 overflow-x-auto whitespace-pre">{SMTP_SNIPPET}</pre>
                  </div>
                )}
                {delivery === "none" && (
                  <div className="rounded-xl border border-[#e5c98a] bg-[#fdf6e8] px-4 py-3 text-[0.8rem] text-[#7a5a10] leading-relaxed">{info}</div>
                )}

                <div>
                  <label className="block text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#5c6b80] mb-2">{t("6-digit code")}</label>
                  <OtpInput value={code} onChange={setCode} />
                </div>

                {err && <div className="rounded-xl border border-[#e8b4a8] bg-[#fbeeea] text-[#8c3322] text-[0.82rem] px-4 py-3">{err}</div>}
                <button disabled={busy || code.length !== 6} className="lf-btn w-full rounded-xl bg-[#12263f] text-white font-bold h-11 text-[0.9rem] disabled:opacity-50 hover:bg-[#1b3557] transition-colors">
                  {busy ? t("Saving…") : t("Verify code")}
                </button>
                <div className="flex items-center justify-between text-[0.8rem] font-semibold">
                  <button type="button" onClick={() => { setStep(1); setErr(""); setCode(""); }} className="text-[#5c6b80] hover:text-[#12263f]">{t("Use a different email")}</button>
                  <button type="button" onClick={() => requestCode()} disabled={busy} className="text-[#0d6b57] hover:text-[#0a4f41] disabled:opacity-50">{t("Resend code")}</button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={doReset} className="space-y-5">
                <div>
                  <h1 className="font-display text-[1.35rem] font-bold text-[#12263f]">{t("Set a new password")}</h1>
                  <p className="text-[0.82rem] text-[#5c6b80] mt-1.5">Your account opens immediately with the new password; all other sessions are signed out.</p>
                </div>
                <div>
                  <label htmlFor="fp-pw" className="block text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#5c6b80] mb-1.5">{t("New password")}</label>
                  <div className="relative">
                    <input id="fp-pw" type={showPw ? "text" : "password"} className="nv-inp pe-11 h-11 text-[0.95rem]" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" autoFocus />
                    <EyeBtn shown={showPw} onClick={() => setShowPw(!showPw)} />
                  </div>
                </div>
                {err && <div className="rounded-xl border border-[#e8b4a8] bg-[#fbeeea] text-[#8c3322] text-[0.82rem] px-4 py-3">{err}</div>}
                <button disabled={busy || pw.length < 6} className="lf-btn w-full rounded-xl bg-[#0d6b57] text-white font-bold h-11 text-[0.9rem] disabled:opacity-50 hover:bg-[#0a4f41] transition-colors">
                  {busy ? t("Saving…") : t("Reset password & open account")}
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-[0.68rem] text-[#9aa6b5] mt-5 leading-relaxed">
          Codes are single-use and expire in 10 minutes.<br />Email delivery uses RESEND_API_KEY or SMTP settings from .env.
        </p>
      </div>
    </div>
  );
}
