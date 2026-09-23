import { api, body } from "@/server/api.mjs";
import { createSalesReturn, createPurchaseReturn } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  if (b.type === "sale") return createSalesReturn(user, b);
  if (b.type === "purchase") return createPurchaseReturn(user, b);
  throw new BizError("Return type must be 'sale' or 'purchase'");
});
