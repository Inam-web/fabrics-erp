// Client + server safe formatting helpers
export const money = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "Rs 0";
  const sign = x < 0 ? "-" : "";
  return `${sign}Rs ${Math.abs(x).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
};

export const money2 = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "Rs 0.00";
  return `Rs ${x.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const num = (v, d = 0) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("en-PK", { maximumFractionDigits: d, minimumFractionDigits: 0 });
};

export const qtyFmt = (v) => num(v, 2).replace(/\.00$/, "");

export const compact = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return "0";
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(1)} Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(1)} L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs}`;
};

export const dateFmt = (d) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const dt = new Date(s + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const dateShort = (d) => {
  if (!d) return "—";
  const dt = new Date(String(d).slice(0, 10) + "T00:00:00");
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

export const dtFmt = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const daysBetween = (fromStr, toStr) => {
  const a = new Date(String(fromStr).slice(0, 10) + "T00:00:00Z");
  const b = new Date(String(toStr).slice(0, 10) + "T00:00:00Z");
  return Math.floor((b - a) / 86400000);
};

export const title = (s) =>
  String(s || "")
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// Normalize a phone number to the digits-only international form that wa.me requires.
// Pakistani numbers are usually stored locally (03xx…, 091-…, +92…, 0092…) — WhatsApp
// silently fails on a leading 0, so convert to 92… . Returns "" when unusable.
export const waPhone = (raw) => {
  const d = String(raw || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.startsWith("0092")) return d.slice(2); // 0092xxxxxxxx -> 92xxxxxxxx
  if (d.startsWith("92")) return d;             // already country-coded
  if (d.startsWith("0")) return "92" + d.slice(1); // 03xx/091x -> 923xx/9291x
  if (d.length === 10) return "92" + d;         // 3xxxxxxxxx / 91xxxxxxxx without prefix
  return d;                                      // best effort for foreign numbers
};

// Amount in words for invoices (South-Asian lakh/crore grouping, matching en-PK money).
// e.g. 594500 -> "Rupees Five Lac Ninety Four Thousand Five Hundred Only". Handles paisa.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const groupWords = (n) => {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)] + " Hundred"); n %= 100; }
  if (n) out.push(twoDigits(n));
  return out.join(" ");
};
export const inWords = (v) => {
  let x = Number(v);
  if (!Number.isFinite(x)) return "Rupees Zero Only";
  const neg = x < 0;
  x = Math.abs(x);
  let rupees = Math.floor(x);
  let paisa = Math.round((x - rupees) * 100);
  if (paisa >= 100) { rupees += 1; paisa -= 100; }
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  const rest = rupees;
  const parts = [];
  if (crore) parts.push(groupWords(crore) + " Crore");
  if (lakh) parts.push(groupWords(lakh) + " Lac");
  if (thousand) parts.push(groupWords(thousand) + " Thousand");
  if (rest) parts.push(groupWords(rest));
  let words = parts.length ? `Rupees ${parts.join(" ")}` : "Rupees Zero";
  if (paisa) words += ` and ${twoDigits(paisa)} Paisa`;
  return `${neg ? "Minus " : ""}${words} Only`.replace(/\s+/g, " ").trim();
};
