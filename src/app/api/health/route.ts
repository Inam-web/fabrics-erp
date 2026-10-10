import { NextResponse } from "next/server";
import { pool } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let client;
  try {
    client = await pool.connect();

    const result = await client.query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        current_schema() AS current_schema,
        current_setting('search_path') AS search_path,
        to_regclass('public.sessions') IS NOT NULL AS sessions,
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.products') IS NOT NULL AS products,
        to_regclass('public.payments') IS NOT NULL AS payments,
        to_regclass('public.expenses') IS NOT NULL AS expenses
    `);

    return NextResponse.json(
      { ok: true, db: true, diagnostic: result.rows[0] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, db: false, reason: msg },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    client?.release();
  }
}
