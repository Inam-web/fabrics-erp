import { NextResponse } from "next/server";
import { hashPassword, createSession, rateLimit } from "@/server/auth.mjs";
import { registerBusiness } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export async function POST(req) {
  try {
    let b;
    try {
      b = await req.json();
    } catch {
      throw new BizError("Invalid request body", 400);
    }
    if (!rateLimit(`register:${String(b.email || "").toLowerCase()}`, 5, 60000)) {
      throw new BizError("Too many attempts — please try again in a minute", 429);
    }
    if (!b.businessName?.trim()) throw new BizError("Business name is required");
    if (String(b.businessName).trim().length > 120) throw new BizError("Business name is too long");
    if (!b.ownerName?.trim()) throw new BizError("Your name is required");
    if (!/^\S+@\S+\.\S+$/.test(String(b.email || "").trim())) throw new BizError("Enter a valid email address");
    if (String(b.password || "").length < 6) throw new BizError("Password must be at least 6 characters");

    let userId;
    try {
      ({ userId } = await registerBusiness({
        businessName: b.businessName, ownerName: b.ownerName,
        email: b.email, phone: b.phone || null,
        passwordHash: hashPassword(b.password),
      }));
    } catch (e) {
      const m = `${e?.message || ""} ${e?.cause?.message || ""} ${e?.cause?.cause?.message || ""}`;
      if (m.includes("password authentication failed")) throw new BizError("Database password mismatch — the postgres password in your .env doesn't match your local PostgreSQL. Update .env and drizzle.config.json, then restart.", 503);
      if (m.includes("ECONNREFUSED")) throw new BizError("PostgreSQL is not running — start it first, then try again.", 503);
      throw e;
    }
    await createSession(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof BizError ? e.status : 500;
    return NextResponse.json({ error: e?.message || "Something went wrong" }, { status });
  }
}
