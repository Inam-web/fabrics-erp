// Minimal RFC-4180 CSV reader for bulk import — handles quoted fields, escaped
// quotes (""), embedded commas/newlines inside quotes, CRLF and a UTF-8 BOM.
// Tab-separated files are also accepted (delimiter auto-detected from line 1).
export function parseCsv(text, delim) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const d = delim || (src.includes("\t") && !src.includes(",") ? "\t" : ",");
  const rows = [];
  let field = "", row = [], inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === d) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

// "opening balance" / "Opening-Balance" / "openingBalance" all canonicalise to
// "openingBalance"; an alias map (lower-trimmed header -> field) overrides.
export function canonHeader(h, aliases) {
  const k = String(h || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (aliases?.[k]) return aliases[k];
  const parts = k.split(" ").filter(Boolean);
  return parts.length
    ? parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join("")
    : "field";
}

// First row is the header; returns an array of plain objects keyed by canonical
// field names. Extra/unknown columns are kept (server ignores what it doesn't use).
export function csvToObjects(rows, aliases) {
  const [head, ...rest] = rows;
  if (!head) return [];
  const keys = head.map((h) => canonHeader(h, aliases));
  return rest.map((r) => {
    const o = {};
    keys.forEach((k, i) => { o[k] = String(r[i] ?? "").trim(); });
    return o;
  });
}

// Build a downloadable template CSV (header + one sample row) for a spec.
export function templateCsv(columns, sample) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.map((c) => c.label || c.key).map(esc).join(","), (sample || []).map(esc).join(",")].join("\n");
}
