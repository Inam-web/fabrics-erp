import { api, body } from "@/server/api.mjs";
import { transferBetweenAccounts } from "@/server/services.mjs";
import { BizError, canManageMoney } from "@/server/util.mjs";

export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  if (b.action === "transfer") {
    if (!canManageMoney(user.role)) throw new BizError("Only owner, manager, accountant or cashier can transfer between accounts", 403);
    return transferBetweenAccounts(user, b);
  }
  throw new BizError("Unknown action");
});
