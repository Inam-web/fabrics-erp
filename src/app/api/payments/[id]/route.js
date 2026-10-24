import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { api, body } from "@/server/api.mjs";
import { reversePayment } from "@/server/services.mjs";
import { BizError, canOverride } from "@/server/util.mjs";

export const POST = api(async ({ user, ctx, req }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const b = await body(req);
  if (b.action === "reverse") {
    return reversePayment(user, id, b.reason);
  }
  if (b.action === "edit") {
    if (!canOverride(user.role)) throw new BizError("Only owner/manager can edit payments", 403);
    const [pay] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.businessId, user.businessId))).limit(1);
    if (!pay) throw new BizError("Payment not found", 404);
    if (pay.status !== "final") throw new BizError("Reversed payments cannot be edited");
    const patch = {};
    if (b.notes !== undefined) patch.notes = String(b.notes || "");
    if (b.method !== undefined) {
      const methods = ["cash", "bank_transfer", "cheque", "online", "easypaisa", "jazzcash", "other"];
      if (!methods.includes(b.method)) throw new BizError("Invalid payment method");
      patch.method = b.method;
    }
    await db.update(payments).set(patch).where(eq(payments.id, id));
    return { ok: true };
  }
  throw new BizError("Unknown action");
});
