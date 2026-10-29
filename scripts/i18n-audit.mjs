// i18n coverage audit: scans every t("…") / t('…') literal in src and reports
// keys missing from the Urdu and Pashto dictionaries. Run: node scripts/i18n-audit.mjs
// (also used by src/lib/__tests__/i18n.test.js to keep coverage from rotting).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p, out); }
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

// Collect literal keys: t("…") / t('…') — dynamic template keys are ignored.
export function collectUsedKeys() {
  const keys = new Set();
  const re = /(?<![A-Za-z0-9_$.])t\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*[,)]/g;
  for (const f of walk(SRC)) {
    if (f.replace(/\\/g, "/").endsWith("src/lib/i18n.js")) continue;
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(re)) {
      const raw = m[1].slice(1, -1);
      keys.add(raw.replace(/\\"/g, '"').replace(/\\'/g, "'"));
    }
  }
  return keys;
}

export async function findMissing() {
  const mod = await import(pathToFileURL(join(SRC, "lib", "i18n.js")).href);
  const used = collectUsedKeys();
  const missingFor = (dict) => [...used].filter((k) => !(k in dict)).sort();
  const unusedFor = (dict) => Object.keys(dict).filter((k) => !used.has(k)).sort();
  return {
    usedCount: used.size,
    ur: { total: Object.keys(mod.ur).length, missing: missingFor(mod.ur), unused: unusedFor(mod.ur) },
    ps: { total: Object.keys(mod.ps).length, missing: missingFor(mod.ps), unused: unusedFor(mod.ps) },
    dictParity: Object.keys(mod.ur).filter((k) => !(k in mod.ps)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await findMissing();
  console.log(`Used keys: ${r.usedCount}`);
  console.log(`ur: ${r.ur.total} entries, missing ${r.ur.missing.length}, unused ${r.ur.unused.length}`);
  console.log(`ps: ${r.ps.total} entries, missing ${r.ps.missing.length}, unused ${r.ps.unused.length}`);
  console.log(`in ur but not ps: ${r.dictParity.length}`);
  const show = (arr, n = 200) => arr.slice(0, n).forEach((k) => console.log(`  - ${k}`));
  if (r.ur.missing.length) { console.log("MISSING (ur):"); show(r.ur.missing); }
  if (r.ps.missing.length) { console.log("MISSING (ps):"); show(r.ps.missing); }
}
