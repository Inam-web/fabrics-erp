import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cheques, customers, suppliers } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { updateChequeStatus } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user }) => {
  const rows = await db.select({
    cheque: cheques, customer: customers.name, supplier: suppliers.name,
  }).from(cheques)
    .leftJoin(customers, and(eq(customers.id, cheques.partyId), eq(cheques.partyType, "customer")))
    .leftJoin(suppliers, and(eq(suppliers.id, cheques.partyId), eq(cheques.partyType, "supplier")))
    .where(eq(cheques.businessId, user.businessId))
    .orderBy(desc(cheques.createdAt)).limit(300);
  return {
    cheques: rows.map((r) => ({ ...r.cheque, party: r.cheque.partyType === "customer" ? r.customer : r.supplier })),
  };
});

export const PATCH = api(async ({ user, req }) => {
  const b = await body(req);
  if (!b.id || !b.status) throw new BizError("id and status required");
  await updateChequeStatus(user, Number(b.id), b.status, b.note);
  return { ok: true };
});
