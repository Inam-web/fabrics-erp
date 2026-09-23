import { NextResponse } from "next/server";
import { requireUser } from "./auth.mjs";
import { BizError } from "./util.mjs";

// Wraps a route handler: auth + uniform error envelope.
export function api(handler) {
  return async function wrapped(req, ctx) {
    try {
      const user = await requireUser();
      const out = await handler({ user, req, ctx });
      if (out instanceof NextResponse || out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof BizError ? e.status : e?.status || 500;
      if (status >= 500) console.error("[api]", e);
      return NextResponse.json({ error: e?.message || "Something went wrong" }, { status });
    }
  };
}

export async function body(req) {
  try {
    return await req.json();
  } catch {
    throw new BizError("Invalid request body", 400);
  }
}
