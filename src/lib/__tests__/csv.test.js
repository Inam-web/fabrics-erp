import { describe, it, expect } from "vitest";
import { parseCsv, canonHeader, csvToObjects, templateCsv } from "@/lib/csv.js";

describe("parseCsv", () => {
  it("splits simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
  it("handles quoted fields with commas and newlines", () => {
    expect(parseCsv('name,note\n"Shahi, Cloth","line1\nline2"')).toEqual([
      ["name", "note"],
      ["Shahi, Cloth", "line1\nline2"],
    ]);
  });
  it("handles escaped quotes", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });
  it("strips BOM and normalizes CRLF", () => {
    expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n   ,  \n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("auto-detects tab separated files", () => {
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("canonHeader / csvToObjects", () => {
  it("canonicalizes header spellings to camelCase", () => {
    expect(canonHeader("Opening Balance")).toBe("openingBalance");
    expect(canonHeader("opening-balance")).toBe("openingBalance");
    expect(canonHeader("OPENINGBALANCE")).toBe("openingbalance");
  });
  it("alias map overrides win", () => {
    expect(canonHeader("Business Name", { "business name": "name" })).toBe("name");
  });
  it("maps rows to objects by header", () => {
    const objs = csvToObjects([["Name", "Credit Limit"], ["Ali", "5000"], ["Bilal", ""]]);
    expect(objs).toEqual([
      { name: "Ali", creditLimit: "5000" },
      { name: "Bilal", creditLimit: "" },
    ]);
  });
  it("returns [] for header-only or empty input", () => {
    expect(csvToObjects([["name"]])).toEqual([]);
    expect(csvToObjects([])).toEqual([]);
  });
});

describe("templateCsv", () => {
  it("quotes values containing commas and escapes quotes", () => {
    const csv = templateCsv([{ key: "name", label: "Name" }], ['Shop, "A"']);
    expect(csv.split("\n")[1]).toBe('"Shop, ""A"""');
  });
});
