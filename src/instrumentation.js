// Runs once when the server starts.
// 1) Reconciles the schema for EXISTING databases (adds missing columns only,
//    preserving every existing record).
// 2) If the database is completely empty (fresh install), seeds the demo
//    business so demo accounts work out of the box.
// Failures never crash the server — the app shows its DB diagnostic screen.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSchema } = await import("./server/migrate.mjs");
    await ensureSchema();
  } catch (e) {
    console.warn("[startup] schema reconciliation skipped:", e?.message || e);
  }
  try {
    const { ensureSeed } = await import("./server/seed-demo.mjs");
    const result = await ensureSeed();
    if (result.seeded) {
      console.log("");
      console.log("=============================================================");
      console.log(" First run detected — demo business auto-seeded.");
      console.log(" Sign in: owner@afridifabrics.pk / afridi123");
      console.log("=============================================================");
      console.log("");
    }
  } catch (e) {
    console.warn("[startup] auto-seed skipped:", e?.message || e);
  }
}
