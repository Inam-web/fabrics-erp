import { api, body } from "@/server/api.mjs";
import { bulkImport } from "@/server/services.mjs";

// Bulk CSV import endpoint backing the in-page importers on
// Customers / Suppliers / Inventory (no sidebar module by design).
export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  return bulkImport(user, { entity: b.entity, rows: b.rows });
});
