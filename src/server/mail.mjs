// AfridiTech mail system — layered delivery, no hard dependency on any provider.
//
// Every message is ALWAYS delivered to the platform owner's secure IN-APP mailbox
// (owner_mailbox table, owner-only). In addition, external delivery is attempted
// through the first configured transport, in order:
//   1. SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS) — our own nodemailer transport,
//      works for any recipient.
//   2. Resend (RESEND_API_KEY) — used for owner-directed mail; Resend's free/testing
//      tier permits sending to the Resend account's own address, which is exactly
//      where verification codes go (OWNER_VERIFY_EMAIL).
// External failures never block the flow: the in-app mailbox already holds the code.
// Codes are never returned to clients, never logged, and stored only as hashes
// (verification rows) plus the owner's private mailbox.
import { db } from "@/db";
import { ownerMailbox } from "@/db/schema";
import { createHash } from "node:crypto";

export const OWNER_EMAIL = () =>
  (process.env.OWNER_VERIFY_EMAIL || "").trim() || "inamuafridi300@gmail.com";

export const smtpConfigured = () => Boolean(process.env.SMTP_HOST);
export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const mailConfigured = () => true; // in-app mailbox always available

async function smtpSend({ to, subject, text, html }) {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || `"AfridiTech ERP" <no-reply@${process.env.SMTP_HOST}>`,
    to, subject, text, html,
  });
}

async function resendSend({ to, subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(process.env.RESEND_API_KEY).trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: (process.env.MAIL_FROM || "").trim() || "AfridiTech ERP <onboarding@resend.dev>",
      to: [to], subject, text, html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Resend email failed (${res.status}): ${body.slice(0, 240)}`);
    err.detail = body.slice(0, 240);
    throw err;
  }
  return res.json().catch(() => ({}));
}

// Attempts external delivery (SMTP first, then Resend). Returns { emailed, provider, error? }.
async function externalSend({ to, subject, text, html }) {
  if (smtpConfigured()) {
    try {
      await smtpSend({ to, subject, text, html });
      return { emailed: true, provider: "smtp" };
    } catch (e) {
      return { emailed: false, provider: "smtp", error: String(e?.message || e).slice(0, 200) };
    }
  }
  if (resendConfigured()) {
    try {
      await resendSend({ to, subject, text, html });
      return { emailed: true, provider: "resend" };
    } catch (e) {
      // Free-tier Resend only sends to the account owner's own address. If the target
      // is the owner email this should succeed; otherwise report cleanly.
      return { emailed: false, provider: "resend", error: String(e?.detail || e?.message || e).slice(0, 200) };
    }
  }
  return { emailed: false, provider: null, error: "no external mail transport configured" };
}

// Delivers a message to the owner's in-app mailbox (always) and to an external
// address when a transport is available. `smtpTo` overrides the external recipient.
export async function deliverToOwner({ kind = "system", businessId = null, subject, body, code = null, html = null, smtpTo = null }) {
  const external = await externalSend({ to: smtpTo || OWNER_EMAIL(), subject, text: body, html: html || undefined });
  const [row] = await db.insert(ownerMailbox).values({
    kind, businessId, subject, body, code, emailed: external.emailed,
  }).returning({ id: ownerMailbox.id });
  return { mailboxId: row.id, emailed: external.emailed, provider: external.provider, emailError: external.error || null };
}

export const hashToken = (t) => createHash("sha256").update(t).digest("hex");
