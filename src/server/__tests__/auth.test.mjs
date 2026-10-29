import { describe, it, expect, vi, beforeAll } from "vitest";

// auth.mjs pulls next/headers (cookie jar) — stub it so pure crypto/rate-limit
// logic can be tested outside the Next runtime.
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }),
}));

let hashPassword, verifyPassword, rateLimit;
beforeAll(async () => {
  const auth = await import("@/server/auth.mjs");
  hashPassword = auth.hashPassword;
  verifyPassword = auth.verifyPassword;
  rateLimit = auth.rateLimit;
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
