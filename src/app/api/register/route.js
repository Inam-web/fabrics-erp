import { NextResponse } from "next/server";
import { hashPassword, createSession, rateLimit } from "@/server/auth.mjs";
import {
  registerBusiness, verifyBusinessCode, storeBusinessVerification,
  newVerificationCode, VERIFY_MAX_ATTEMPTS,
} from "@/server/services.mjs";
import { deliverToOwner, smtpConfigured } from "@/server/mail.mjs";
import { BizError } from "@/server/util.mjs";
import { BIZ_KEYS } from "@/lib/businessTypes";
import { db } from "@/db";
import { businesses, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Owner-controlled registration: the 6-digit verification code is emailed ONLY to
// the platform owner (OWNER_VERIFY_EMAIL, default inamuafridi@gmail.com). The owner
// personally shares the code with the client. The code is never returned to the
// browser, never logged, and is stored only as a SHA-256 hash.

async function sendVerificationEmail({ businessName, ownerName, code, businessId }) {
  const body =
    `A new business has registered on AfridiTech ERP.\n\n` +
    `Business: ${businessName}\nOwner: ${ownerName}\n\n` +
    `Verification code: ${code}\n` +
    `This code expires in 24 hours and can be used once.\n` +
    `Share it with the client ONLY if you approve this registration.\n`;
  return deliverToOwner({
    kind: "verification",
    businessId,
    subject: `New business registration — verification code for ${businessName}`,
    body,
    code,
    html: `<p>A new business has registered on <b>AfridiTech ERP</b>.</p>` +
      `<p>Business: <b>${businessName}</b><br/>Owner: ${ownerName}</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:800">${code}</p>` +
      `<p>Expires in <b>24 hours</b>, single use. Share it with the client <b>only if you approve</b> this registration.</p>`,
  });
}

export async function POST(req) {
  try {
    let b;
    try {
      b = await req.json();
    } catch {
      throw new BizError("Invalid request body", 400);
    }

    // ---- verify an issued code (client activates their business) ----
    if (b.action === "verify_business") {
      const email = String(b.email || "").toLowerCase().trim();
      if (!rateLimit(`verify:${email}`, 6, 60000)) throw new BizError("Too many attempts — try again in a minute", 429);
      const { businessId, ownerId } = await verifyBusinessCode(email, b.code);
      await createSession(ownerId); // verified owner signs straight in
      return NextResponse.json({ ok: true, verified: true, businessId });
    }

    // ---- resend a fresh code to the owner ----
    if (b.action === "resend_verification") {
      const email = String(b.email || "").toLowerCase().trim();
      if (!rateLimit(`resend:${email}`, 3, 60000)) throw new BizError("Please wait a minute before requesting another code", 429);
      const [biz] = await db.select({ id: businesses.id, name: businesses.name })
        .from(businesses)
        .where(and(eq(businesses.status, "pending"), sql`EXISTS (SELECT 1 FROM users u WHERE u.business_id = businesses.id AND u.email = ${email})`))
        .limit(1);
      if (!biz) throw new BizError("No pending registration found for this email", 404);
      const [ownerRow] = await db.select({ name: users.name }).from(users).where(and(eq(users.businessId, biz.id), eq(users.role, "owner"))).limit(1);
      const code = newVerificationCode();
      await sendVerificationEmail({ businessName: biz.name, ownerName: ownerRow?.name || "", code, businessId: biz.id });
      await storeBusinessVerification(biz.id, code);
      return NextResponse.json({ ok: true, resent: true });
    }

    // ---- new registration ----
    if (!rateLimit(`register:${String(b.email || "").toLowerCase()}`, 5, 60000)) {
      throw new BizError("Too many attempts — please try again in a minute", 429);
    }
    if (!b.businessName?.trim()) throw new BizError("Business name is required");
    if (String(b.businessName).trim().length > 120) throw new BizError("Business name is too long");
    if (!b.ownerName?.trim()) throw new BizError("Your name is required");
    if (!/^\S+@\S+\.\S+$/.test(String(b.email || "").trim())) throw new BizError("Enter a valid email address");
    if (String(b.password || "").length < 6) throw new BizError("Password must be at least 6 characters");
    const bizType = BIZ_KEYS.includes(b.bizType) ? b.bizType : "fabric";
    const address = b.address ? String(b.address).trim().slice(0, 300) : null;
    // 1) create the pending registration first (account exists, locked until verified)
    let result;
    try {
      result = await registerBusiness({
        businessName: b.businessName, ownerName: b.ownerName,
        email: b.email, phone: b.phone || null,
        address, bizType,
        passwordHash: hashPassword(b.password), status: "pending",
      });
    } catch (e) {
      const m = `${e?.message || ""} ${e?.cause?.message || ""} ${e?.cause?.cause?.message || ""}`;
      if (m.includes("password authentication failed")) throw new BizError("Database password mismatch — update .env, then restart.", 503);
      if (m.includes("ECONNREFUSED")) throw new BizError("PostgreSQL is not running — start it first, then try again.", 503);
      throw e;
    }

    // 2) generate the 6-digit code and deliver it to the platform owner's mailbox
    //    (in-app mailbox always; real email too when SMTP is configured)
    const code = newVerificationCode();
    const delivery = await sendVerificationEmail({ businessName: b.businessName, ownerName: b.ownerName, code, businessId: result.businessId });
    await storeBusinessVerification(result.businessId, code);
    return NextResponse.json({
      ok: true, pending: true,
      delivered: true, emailed: delivery.emailed, smtp: smtpConfigured(),
      maxAttempts: VERIFY_MAX_ATTEMPTS,
    });
  } catch (e) {
    const status = e instanceof BizError ? e.status : 500;
    return NextResponse.json({ error: e?.message || "Something went wrong" }, { status });
  }
}
