import { NextResponse } from "next/server";
import { login, destroySession, rateLimit } from "@/server/auth.mjs";
import { BizError } from "@/server/util.mjs";

export async function POST(req) {
  try {
    const data = await req.json();
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
