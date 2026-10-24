import { NextResponse } from "next/server";
import { login, destroySession, rateLimit, demoLogin } from "@/server/auth.mjs";
import { deliverToOwner, hashToken } from "@/server/mail.mjs";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, passwordResets, sessions as sessionsTable } from "@/db/schema";
import { BizError } from "@/server/util.mjs";

export async function POST(req) {
  try {
    const data = await req.json();
    if (data.action === "forgot") {
      const email = String(data.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new BizError("Enter a valid email address", 400);
      if (!rateLimit(`forgot:${email}`, 3, 60000)) throw new BizError("Too many requests. Try again in a minute.", 429);
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const ott = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit OTT
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      if (u) {
        await db.insert(passwordResets).values({ userId: u.id, tokenHash: hashToken(ott), expiresAt });
        // Delivered to the platform owner's secure in-app mailbox; when SMTP is
        // configured the same code is also emailed directly to the user.
        // The code is never returned to the browser and never logged.
        const del = await deliverToOwner({
          kind: "password_reset",
          subject: `Password reset code requested for ${u.email}`,
          body: `Assalam-o-Alaikum,\n\nA password reset was requested for ${u.email} (${u.name}).\nOne-time code: ${ott}\nIt expires in 10 minutes and can be used once.\nIf you did not request this, ignore this message.\n`,
          code: ott,
          smtpTo: u.email,
        });
        // neutral response: does not reveal whether the account exists
        return NextResponse.json({ ok: true, delivery: "mailbox", emailed: del.emailed });
      }
      return NextResponse.json({ ok: true, delivery: "mailbox", emailed: false });
    }
    if (data.action === "reset_verify") {
      const code = String(data.code || "").trim();
      if (!/^\d{6}$/.test(code)) throw new BizError("Enter the 6-digit code", 400);
      const [r] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, hashToken(code))).limit(1);
      if (!r) throw new BizError("Invalid code", 400);
      if (r.usedAt) throw new BizError("This code was already used", 400);
      if (new Date(r.expiresAt) < new Date()) throw new BizError("This code has expired — request a new one", 400);
      return NextResponse.json({ ok: true, valid: true });
    }
    if (data.action === "reset") {
      const code = String(data.code || "").trim();
      const pw = String(data.password || "");
      if (pw.length < 6) throw new BizError("Password must be at least 6 characters", 400);
      const [r] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, hashToken(code))).limit(1);
      if (!r) throw new BizError("Invalid code", 400);
      if (r.usedAt) throw new BizError("This code was already used", 400);
      if (new Date(r.expiresAt) < new Date()) throw new BizError("This code has expired — request a new one", 400);
      const { hashPassword, createSession } = await import("@/server/auth.mjs");
      await db.transaction(async (t) => {
        await t.update(users).set({ passwordHash: hashPassword(pw) }).where(eq(users.id, r.userId));
        await t.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
        await t.update(sessionsTable).set({ expiresAt: new Date() }).where(eq(sessionsTable.userId, r.userId));
      });
      await createSession(r.userId); // open the account right away with the new password
      return NextResponse.json({ ok: true, reset: true, signedIn: true });
    }
    if (data.action === "demo") {
      if (!rateLimit(`demo:${data.code}`, 8, 60000)) throw new BizError("Too many attempts. Try again in a minute.", 429);
      await demoLogin(data.code);
      return NextResponse.json({ ok: true, role: "demo" });
    }
    if (data.action === "logout") {
      await destroySession();
      return NextResponse.json({ ok: true });
    }
    if (!rateLimit(`login:${data.email}`, 8, 60000)) throw new BizError("Too many attempts. Try again in a minute.", 429);
    let u;
    try {
      u = await login(data.email, data.password);
    } catch (e) {
      const m = `${e?.message || ""} ${e?.cause?.message || ""} ${e?.cause?.cause?.message || ""}`;
      if (m.includes("password authentication failed")) throw new BizError("Database password mismatch — the postgres password in your .env doesn't match your local PostgreSQL. Update .env and drizzle.config.json, restart the app, then try again.", 503);
      if (m.includes("ECONNREFUSED")) throw new BizError("PostgreSQL is not running — start it first, then try again.", 503);
      if (m.includes("does not exist")) throw new BizError("Database 'app_db' does not exist yet — run: psql -U postgres -c \"CREATE DATABASE app_db;\" then npx drizzle-kit push", 503);
      throw e;
    }
    return NextResponse.json({ ok: true, name: u.name, role: u.role });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
