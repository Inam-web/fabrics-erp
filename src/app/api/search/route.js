import { api } from "@/server/api.mjs";
import { globalSearch } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const GET = api(async ({ user, req }) => {
  const q = new URL(req.url).searchParams.get("q") || "";
  if (q.trim().length < 2) throw new BizError("Type at least 2 characters");
  return globalSearch(user, q.trim());
});
