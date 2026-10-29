import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Backup engine checks against the configured database. Skipped automatically
// when PostgreSQL is unreachable, same policy as the GL integrity tests.
// The auto-backup test writes real audit rows ("Backup auto-saved") into the
// dev database — that is the behaviour under test, and it is append-only.
let dbOk = false;
let db;
let backup;
beforeAll(async () => {
  backup = await import("@/server/backup.mjs"); // safe without a live DB (lazy pool)
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

describe("backup engine", () => {
  it("is a no-op when BACKUP_DIR is not configured", async () => {
    delete process.env.BACKUP_DIR;
    const r = await backup.maybeRunAutoBackup(new Date("2026-10-28T03:00:00Z"));
    expect(r).toBeNull();
  });

  it("dump covers every table for the business and redacts passwords", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const s = await import("@/db/schema");
    const { businesses } = s;
    const [biz] = await db.select({ id: businesses.id }).from(businesses).limit(1);
    if (!biz) return ctx.skip();
    const dump = await backup.buildBusinessBackup(biz.id);
    expect(dump.format).toBe("faberp-backup/1");
    for (const key of ["customers", "suppliers", "products", "sales", "payments", "journal_entries", "audit_logs"]) {
      expect(Array.isArray(dump[key]), key).toBe(true);
    }
    for (const u of dump.users) expect(u.passwordHash).toBe("[redacted]");
  });

  it("nightly auto-backup writes one JSON file per business and logs it", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const dir = mkdtempSync(join(tmpdir(), "faberp-backup-test-"));
    const prev = process.env.BACKUP_DIR;
    process.env.BACKUP_DIR = dir;
    try {
      const files = await backup.maybeRunAutoBackup(new Date("2026-10-28T03:00:00Z"));
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      expect(readdirSync(dir).length).toBe(files.length);
      for (const f of files) expect(f.endsWith(".json")).toBe(true);
      // second call on the same day must not repeat the run
      expect(await backup.maybeRunAutoBackup(new Date("2026-10-28T04:00:00Z"))).toBeNull();
      // the audit trail now knows a backup happened → reminder age resets to 0
      const bizId = Number(files[0].match(/-(\d+)-\d{4}-\d{2}-\d{2}\.json$/)?.[1]);
      expect(bizId, `unexpected file name: ${files[0]}`).toBeGreaterThan(0);
      const d = await import("@/server/util.mjs");
      expect(await backup.lastBackupAgeDays(bizId, d.todayStr())).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.BACKUP_DIR;
      else process.env.BACKUP_DIR = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
