import { NextResponse } from "next/server";
import { pool } from "@/db";

export async function GET() {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true, db: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: true, db: false, reason: msg });
  }
}
