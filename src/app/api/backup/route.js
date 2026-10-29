import { api } from "@/server/api.mjs";
import { buildBusinessBackup, logBackupEvent } from "@/server/backup.mjs";

// Full business data backup: one JSON file containing every table for this business.
export const GET = api(async ({ user, req }) => {
  const dump = await buildBusinessBackup(user.businessId);
  await logBackupEvent(user.businessId, user.id, "Backup downloaded", req.headers.get("user-agent"));
  return new Response(JSON.stringify(dump), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="faberp-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
