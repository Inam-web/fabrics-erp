import { describe, it, expect } from "vitest";
import { r2, n0, todayStr, addDays, weekMonday, monthStart, canOverride, canManageMoney, BizError } from "@/server/util.mjs";

describe("money rounding (r2/n0)", () => {
  it("rounds to 2 decimals without float drift", () => {
    expect(r2(0.1 + 0.2)).toBe(0.3);
    expect(r2(2.345)).toBe(2.35);
    expect(r2(-10.004)).toBe(-10);
    expect(r2("1234.567")).toBe(1234.57);
    expect(r2("1500")).toBe(1500);
  });
  it("coerces junk to 0 (numeric columns arrive as strings)", () => {
    expect(n0("1500.25")).toBe(1500.25);
    expect(n0(null)).toBe(0);
    expect(n0(undefined)).toBe(0);
    expect(n0("abc")).toBe(0);
    expect(n0(NaN)).toBe(0);
  });
});

describe("date helpers", () => {
  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-05", -6)).toBe("2025-12-30");
  });
  it("weekMonday always returns a Monday", () => {
    expect(weekMonday("2026-10-28")).toBe("2026-10-26"); // Wed -> Mon
    expect(weekMonday("2026-10-26")).toBe("2026-10-26"); // Mon -> same Mon
    expect(weekMonday("2026-10-25")).toBe("2026-10-19"); // Sun -> previous Mon
  });
  it("todayStr returns ISO yyyy-mm-dd", () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("monthStart", () => {
    expect(monthStart("2026-10-28")).toBe("2026-10-01");
  });
});

describe("role gates", () => {
  it("price override only owner/manager", () => {
    expect(canOverride("owner")).toBe(true);
    expect(canOverride("manager")).toBe(true);
    expect(canOverride("cashier")).toBe(false);
    expect(canOverride("salesman")).toBe(false);
  });
  it("money management excludes salesman/warehouse", () => {
    expect(canManageMoney("accountant")).toBe(true);
    expect(canManageMoney("cashier")).toBe(true);
    expect(canManageMoney("salesman")).toBe(false);
    expect(canManageMoney("warehouse")).toBe(false);
  });
});

describe("BizError", () => {
  it("carries a status code for the API envelope", () => {
    const e = new BizError("nope");
    expect(e.status).toBe(400);
    expect(new BizError("gone", 404).status).toBe(404);
    expect(e).toBeInstanceOf(Error);
  });
});
