import { describe, it, expect } from "vitest";
import { money, money2, num, qtyFmt, compact, inWords, waPhone, daysBetween } from "@/lib/format.js";

describe("inWords (invoice amount in words, lakh/crore)", () => {
  it("handles round and grouped amounts", () => {
    expect(inWords(0)).toBe("Rupees Zero Only");
    expect(inWords(1)).toBe("Rupees One Only");
    expect(inWords(594500)).toBe("Rupees Five Lac Ninety Four Thousand Five Hundred Only");
    expect(inWords(10000000)).toBe("Rupees One Crore Only");
    expect(inWords(1234)).toBe("Rupees One Thousand Two Hundred Thirty Four Only");
  });
  it("handles paisa and negatives", () => {
    expect(inWords(250.75)).toBe("Rupees Two Hundred Fifty and Seventy Five Paisa Only");
    expect(inWords(-40)).toBe("Minus Rupees Forty Only");
  });
  it("never produces float junk", () => {
    expect(inWords(0.1 + 0.2)).toBe("Rupees Zero and Thirty Paisa Only");
    expect(inWords("abc")).toBe("Rupees Zero Only");
  });
});

describe("money formatting", () => {
  it("groups thousands and hides decimals", () => {
    expect(money(1234567)).toBe("Rs 1,234,567");
    expect(money(-500)).toBe("-Rs 500");
    expect(money("junk")).toBe("Rs 0");
    expect(money2(12.5)).toBe("Rs 12.50");
  });
  it("qtyFmt trims empty decimals", () => {
    expect(qtyFmt(12)).toBe("12");
    expect(qtyFmt(12.25)).toBe("12.25");
    expect(qtyFmt(1000)).toBe("1,000");
  });
  it("compact uses Lakh/Crore scale", () => {
    expect(compact(150000)).toBe("1.5 L");
    expect(compact(25000000)).toBe("2.5 Cr");
    expect(compact(950)).toBe("950");
  });
});

describe("waPhone (WhatsApp normalization)", () => {
  it("converts local Pakistani formats to 92…", () => {
    expect(waPhone("03001234567")).toBe("923001234567");
    expect(waPhone("0300-1234567")).toBe("923001234567");
    expect(waPhone("+923001234567")).toBe("923001234567");
    expect(waPhone("00923001234567")).toBe("923001234567");
    expect(waPhone("")).toBe("");
  });
});

describe("daysBetween", () => {
  it("counts inclusive-style day gaps", () => {
    expect(daysBetween("2026-10-01", "2026-10-28")).toBe(27);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(0);
  });
});
