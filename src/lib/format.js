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
