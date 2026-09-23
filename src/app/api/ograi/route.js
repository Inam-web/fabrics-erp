import { api, body } from "@/server/api.mjs";
import { generateSchedules, createInstallmentPlan, adjustSchedule } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

export const POST = api(async ({ user, req }) => {
  if (!["owner", "manager", "accountant"].includes(user.role)) {
    throw new BizError("Only owner, manager or accountant can manage collection schedules", 403);
  }
  const b = await body(req);
  if (b.action === "generate") {
    const weeks = Math.min(Math.max(Number(b.weeks) || 1, 1), 4);
    const created = await generateSchedules(user, weeks);
    return { created };
  }
  if (b.action === "installments") return createInstallmentPlan(user, b);
  if (b.action === "adjust_schedule") return adjustSchedule(user, b);
  throw new BizError("Unknown action");
});
