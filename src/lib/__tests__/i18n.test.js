import { describe, it, expect } from "vitest";
import { findMissing } from "../../../scripts/i18n-audit.mjs";

// Guards localization coverage: every t("…") literal used in the app must exist
// in the Urdu and Pashto dictionaries (missing keys fall back to English, so
// this catches drift rather than breakage — the same philosophy as the app).
const r = await findMissing();

describe("i18n dictionary coverage", () => {
  it("urdu covers every key used in the UI", () => {
    expect(r.ur.missing, `missing in ur: ${r.ur.missing.join(" | ")}`).toEqual([]);
  });
  it("pashto covers every key used in the UI", () => {
    expect(r.ps.missing, `missing in ps: ${r.ps.missing.join(" | ")}`).toEqual([]);
  });
  it("no empty translations", async () => {
    const { ur, ps } = await import("@/lib/i18n.js");
    const empties = [...Object.entries(ur), ...Object.entries(ps)].filter(([, v]) => !String(v).trim());
    expect(empties.map(([k]) => k)).toEqual([]);
  });
});
