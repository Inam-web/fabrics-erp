import { describe, it, expect, beforeAll } from "vitest";

// Read-only double-entry integrity checks against the configured database.
// Skipped automatically when PostgreSQL is unreachable, so `npm test` runs
// anywhere; on a real environment it guards the money engine.
let db, sql, eq;
let dbOk = false;
beforeAll(async () => {
  try {
    ({ db } = await import("@/db"));
    ({ sql, eq } = await import("drizzle-orm"));
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

describe("general ledger integrity", () => {
  it("every journal entry is balanced (Σdebit = Σcredit per entry)", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { journalEntries: je, journalLines: jl } = await import("@/db/schema");
    const bad = await db
      .select({ id: je.id })
      .from(je)
      .innerJoin(jl, eq(jl.entryId, je.id))
      .groupBy(je.id)
      .having(sql`ROUND(SUM(${jl.debit}::numeric) - SUM(${jl.credit}::numeric), 2) <> 0`);
    expect(bad, `unbalanced journal entries: ${bad.map((b) => b.id).join(", ")}`).toEqual([]);
  });

  it("trial balance totals tie out globally", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { journalLines: jl } = await import("@/db/schema");
    const [agg] = await db
      .select({ d: sql`COALESCE(SUM(${jl.debit}::numeric),0)`, c: sql`COALESCE(SUM(${jl.credit}::numeric),0)` })
      .from(jl);
    expect(Math.round(Number(agg.d) - Number(agg.c))).toBe(0);
  });

  it("no negative amounts are stored on journal lines", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { journalLines: jl } = await import("@/db/schema");
    const [neg] = await db
      .select({ n: sql`COUNT(*)` })
      .from(jl)
      .where(sql`${jl.debit}::numeric < 0 OR ${jl.credit}::numeric < 0`);
    expect(Number(neg.n)).toBe(0);
  });

  it("no journal lines point at a missing entry (referential wholeness)", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { journalLines: jl } = await import("@/db/schema");
    const [orphan] = await db.select({ n: sql`COUNT(*)` }).from(jl)
      .where(sql`${jl.entryId} NOT IN (SELECT id FROM journal_entries)`);
    expect(Number(orphan.n)).toBe(0);
  });
});
