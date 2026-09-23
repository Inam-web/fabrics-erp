import { api } from "@/server/api.mjs";
import { getPartyLedger } from "@/server/services.mjs";

export const GET = api(async ({ user, ctx }) => {
  const params = await ctx.params;
  const id = Number(params.id);
  const { party, rows } = await getPartyLedger(user.businessId, "supplier", id);
  return { supplier: party, ledger: rows };
});
