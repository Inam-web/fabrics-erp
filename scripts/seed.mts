/* Manual seeding (optional — the app also auto-seeds on first start).
   Run: npx tsx scripts/seed.mts */
import "dotenv/config";
import { db } from "../src/db/index";
import * as s from "../src/db/schema";
import { seedDemoBusiness } from "../src/server/seed-demo.mjs";

async function main() {
  const existing = await db.select({ id: s.businesses.id }).from(s.businesses).limit(1);
  if (existing.length) {
    console.log("Database already seeded. Skipping.");
    return;
  }
  await seedDemoBusiness();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
