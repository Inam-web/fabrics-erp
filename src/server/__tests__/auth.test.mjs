import { describe, it, expect, vi, beforeAll } from "vitest";

// auth.mjs pulls next/headers (cookie jar) — stub it so pure crypto/rate-limit
// logic can be tested outside the Next runtime.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
  headers: async () => ({ get: () => null }),
}));

let hashPassword, verifyPassword, rateLimit, mySessions, signOutOtherSessions, resolveSession;
beforeAll(async () => {
  const auth = await import("@/server/auth.mjs");
  hashPassword = auth.hashPassword;
  verifyPassword = auth.verifyPassword;
  rateLimit = auth.rateLimit;
  mySessions = auth.mySessions;
  signOutOtherSessions = auth.signOutOtherSessions;
  resolveSession = auth.resolveSession;
});

describe("password hashing (scrypt)", () => {
  it("verifies a correct password and rejects wrong ones", () => {
    const h = hashPassword("sana123");
    expect(h).toMatch(/^[0-9a-f]{24}:[0-9a-f]{64}$/); // salt:hash, never plaintext
    expect(verifyPassword("sana123", h)).toBe(true);
    expect(verifyPassword("SANA123", h)).toBe(false);
    expect(verifyPassword("", h)).toBe(false);
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
  });
  it("salts each hash differently", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("rateLimit guard", () => {
  it("allows up to max then blocks the key", () => {
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60000)).toBe(true);
    expect(rateLimit(key, 5, 60000)).toBe(false);
  });
  it("isolates keys and windows", () => {
    const a = `ta:${Date.now()}`, b = `tb:${Date.now()}`;
    expect(rateLimit(a, 1, 60000)).toBe(true);
    expect(rateLimit(a, 1, 60000)).toBe(false);
    expect(rateLimit(b, 1, 60000)).toBe(true); // other key unaffected
  });
});

// Session panel logic — needs the database; auto-skips when PostgreSQL is down.
let dbOk = false, db, schema, eq;
beforeAll(async () => {
  try {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ eq } = await import("drizzle-orm"));
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

describe("active sessions panel (mySessions / signOutOtherSessions)", () => {
  it("lists sessions with isCurrent flag and ends only the others", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const [anyUser] = await db.select({ businessId: schema.users.businessId }).from(schema.users).limit(1);
    if (!anyUser) return ctx.skip();
    const stamp = Date.now();
    const [u] = await db.insert(schema.users).values({
      businessId: anyUser.businessId, name: "Sess Test", email: `sess-test-${stamp}@test.local`,
      passwordHash: "x:y", role: "cashier",
    }).returning({ id: schema.users.id });
    const exp = new Date(Date.now() + 86400000);
    const tok = (n) => `t-${n}-${stamp}`;
    await db.insert(schema.sessions).values([
      { token: tok("a"), userId: u.id, expiresAt: exp, agent: "Chrome" },
      { token: tok("b"), userId: u.id, expiresAt: exp },
      { token: tok("c"), userId: u.id, expiresAt: exp },
    ]);
    try {
      const list = await mySessions(u.id, tok("a"));
      expect(list.length).toBe(3);
      expect(list.filter((s) => s.isCurrent).length).toBe(1); // exactly one "this device"
      expect(list.every((s) => s.token === undefined)).toBe(true); // raw tokens never leave the server
      expect(list.find((s) => s.isCurrent).agent).toBe("Chrome");
      const ended = await signOutOtherSessions(u.id, tok("a"));
      expect(ended).toBe(2);
      const after = await db.select({ token: schema.sessions.token }).from(schema.sessions).where(eq(schema.sessions.userId, u.id));
      expect(after.map((r) => r.token)).toEqual([tok("a")]); // current session untouched
    } finally {
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, u.id));
      await db.delete(schema.users).where(eq(schema.users.id, u.id));
    }
  });
});

describe("session enforcement (revoke / expiry kicks live tokens)", () => {
  it("rejects expired sessions and revoked demo grants without logout", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const [anyUser] = await db.select({ businessId: schema.users.businessId }).from(schema.users).limit(1);
    if (!anyUser) return ctx.skip();
    const stamp = Date.now();
    const tok = `rev-${stamp}`;
    const [u] = await db.insert(schema.users).values({
      businessId: anyUser.businessId, name: "Revoke Test", email: `rev-test-${stamp}@test.local`,
      passwordHash: "x:y", role: "demo",
    }).returning({ id: schema.users.id });
    const [grant] = await db.insert(schema.demoGrants).values({
      businessId: anyUser.businessId, clientName: "Revoke Test", code: `RT${stamp}`, status: "active",
    }).returning({ id: schema.demoGrants.id });
    await db.insert(schema.sessions).values({ token: tok, userId: u.id, grantId: grant.id, expiresAt: new Date(Date.now() + 86400000) });
    try {
      // 1. live demo session works while grant is active
      expect((await resolveSession(tok))?.id).toBe(u.id);
      // 2. owner revokes the grant → the SAME live token is rejected instantly
      await db.update(schema.demoGrants).set({ status: "revoked" }).where(eq(schema.demoGrants.id, grant.id));
      expect(await resolveSession(tok)).toBe(null);
      // 3. password-reset style expiry (expiresAt = now) is honoured too
      await db.update(schema.demoGrants).set({ status: "active" }).where(eq(schema.demoGrants.id, grant.id));
      expect((await resolveSession(tok))?.id).toBe(u.id);
      await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.token, tok));
      expect(await resolveSession(tok)).toBe(null);
    } finally {
      await db.delete(schema.sessions).where(eq(schema.sessions.token, tok));
      await db.delete(schema.demoGrants).where(eq(schema.demoGrants.id, grant.id));
      await db.delete(schema.users).where(eq(schema.users.id, u.id));
    }
  });
});
