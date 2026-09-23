import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, req }) => {
  const q = new URL(req.url).searchParams.get("q") || "";
  const conds = [eq(suppliers.businessId, user.businessId)];
  if (q) conds.push(or(ilike(suppliers.name, `%${q}%`), ilike(suppliers.phone, `%${q}%`), ilike(suppliers.code, `%${q}%`)));
  const rows = await db.select().from(suppliers).where(and(...conds)).orderBy(asc(suppliers.name)).limit(300);
  return { suppliers: rows };
});

export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  if (!b.name?.trim()) throw new BizError("Supplier name is required");
  const [count] = await db.select({ n: sql`COUNT(*)` }).from(suppliers).where(eq(suppliers.businessId, user.businessId));
  const [row] = await db.insert(suppliers).values({
    businessId: user.businessId, code: `SUP-${String(Number(count.n) + 1).padStart(3, "0")}`,
    name: b.name.trim(), contactPerson: b.contactPerson || null, phone: b.phone || null,
    address: b.address || null, city: b.city || null, category: b.category || "mill",
    openingBalance: String(b.openingBalance || 0), balance: String(b.openingBalance || 0),
    paymentTerms: b.paymentTerms || "monthly", notes: b.notes || null,
  }).returning({ id: suppliers.id });
  return { id: row.id };
});
