import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { payments, customers, suppliers } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { recordPayment } from "@/server/services.mjs";

export const POST = api(async ({ user, req }) => recordPayment(user, await body(req)));

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const partyType = p.get("partyType") || "customer";
  const limit = Math.min(Number(p.get("limit") || 50), 200);
  const party = partyType === "customer" ? customers : suppliers;
  const rows = await db.select({
    id: payments.id, receiptNo: payments.receiptNo, date: payments.date, amount: payments.amount,
    method: payments.method, notes: payments.notes, status: payments.status, createdAt: payments.createdAt,
    partyName: party.name,
  }).from(payments)
    .innerJoin(party, eq(party.id, payments.partyId))
    .where(and(eq(payments.businessId, user.businessId), eq(payments.partyType, partyType)))
    .orderBy(desc(payments.date), desc(payments.id)).limit(limit);
  return { payments: rows };
});
