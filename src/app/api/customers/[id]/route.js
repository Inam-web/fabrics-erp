import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { getPartyLedger } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, ctx }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const { party, rows } = await getPartyLedger(user.businessId, "customer", id);
  return { customer: party, ledger: rows };
});

export const PATCH = api(async ({ user, ctx, req }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const b = await body(req);
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing || existing.businessId !== user.businessId) throw new BizError("Customer not found", 404);
  const allowed = ["name", "ownerName", "phone", "whatsapp", "address", "city", "area", "cnic", "category", "priceLevel", "discountPct", "creditLimit", "paymentTerms", "weeklyOgrai", "salesmanId", "status", "notes"];
  const patch = {};
  for (const k of allowed) if (k in b) patch[k] = ["discountPct", "creditLimit", "weeklyOgrai"].includes(k) ? String(b[k] ?? 0) : b[k];
  if (patch.salesmanId === "") patch.salesmanId = null;
  await db.update(customers).set(patch).where(eq(customers.id, id));
  return { ok: true };
});
