import { describe, it, expect, beforeAll } from "vitest";

// dashboardData is the post-login landing query bundle — a failure here locks
// the user out of the whole app (as the SUBSTR-on-DATE-type bug proved).
// Skipped automatically when PostgreSQL is unreachable, same policy as gl.test.
let db, dbOk = false;
beforeAll(async () => {
  try {
    ({ db } = await import("@/db"));
    const { pool } = await import("@/db");
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

describe("dashboard aggregates", () => {
  it("dashboardData runs end-to-end and returns well-formed chart series", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { dashboardData } = await import("@/server/services.mjs");
    const { businesses } = await import("@/db/schema");
    const [biz] = await db.select({ id: businesses.id }).from(businesses).limit(1);
    if (!biz) return ctx.skip();
    const d = await dashboardData({ businessId: biz.id });
    expect(d.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.series.days).toHaveLength(7);
    expect(d.months.keys).toHaveLength(6);
    // window must END at the current month, not lag it by one
    expect(d.months.keys[5]).toBe(d.today.slice(0, 7));
    for (const key of ["sales", "collections", "expenses", "purchases"]) {
      expect(d.series[key]).toHaveLength(7);
      for (const v of d.series[key]) expect(typeof v).toBe("number");
    }
    for (const key of ["sales", "collections", "expenses"]) {
      expect(d.months[key]).toHaveLength(6);
      for (const v of d.months[key]) expect(typeof v).toBe("number");
    }
  });
});
