import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, accounts, salesmen, salesmanRoutes, businesses, auditLogs, dayClosings, warehouses, branches, employees, expenseCategories, demoGrants, demoUsage, sessions, sales, payments, stockMovements, ownerMailbox, purchases, salesReturns, purchaseReturns, expenses, accountTransfers, passwordResets } from "@/db/schema";
import { hashPassword, signOutOtherSessions } from "@/server/auth.mjs";
import { api, body } from "@/server/api.mjs";
import { addAccount, closeDay, addExpense, DEMO_MODULES, DEMO_LIMIT } from "@/server/services.mjs";
import { BizError, canOverride, todayStr } from "@/server/util.mjs";

export const GET = api(async ({ user }) => {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, user.businessId)).limit(1);
  const userList = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, phone: users.phone }).from(users).where(eq(users.businessId, user.businessId));
  const sms = await db.select().from(salesmen).where(eq(salesmen.businessId, user.businessId));
  const routes = await db.select().from(salesmanRoutes);
  const audit = await db.select().from(auditLogs).where(eq(auditLogs.businessId, user.businessId)).orderBy(desc(auditLogs.id)).limit(120);
  const closings = await db.select().from(dayClosings).where(eq(dayClosings.businessId, user.businessId)).orderBy(desc(dayClosings.date)).limit(30);
  const accs = await db.select().from(accounts).where(eq(accounts.businessId, user.businessId));
  const whs = await db.select().from(warehouses).where(eq(warehouses.businessId, user.businessId));
  const brs = await db.select().from(branches).where(eq(branches.businessId, user.businessId));
  const staff = await db.select().from(employees).where(eq(employees.businessId, user.businessId));
  let demo = null;
  let mailbox = null;
  const isDemoOwner = user.role === "owner" && business.isDemo === true;
  if (isDemoOwner) {
    mailbox = await db.select().from(ownerMailbox).orderBy(desc(ownerMailbox.id)).limit(50);
  }
  if (isDemoOwner) {
    const [demoBiz] = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
    if (demoBiz) {
      const grants = await db.select().from(demoGrants).where(eq(demoGrants.businessId, demoBiz.id)).orderBy(demoGrants.id);
      const usage = await db.select({ grantId: demoUsage.grantId, module: demoUsage.module, n: sql`count(*)::int` }).from(demoUsage).groupBy(demoUsage.grantId, demoUsage.module);
      demo = {
        business: demoBiz.name, limit: DEMO_LIMIT, modules: DEMO_MODULES,
        grants: grants.map((g) => ({ ...g, usage: Object.fromEntries(DEMO_MODULES.map((m) => [m, Number(usage.find((u) => u.grantId === g.id && u.module === m)?.n || 0)])) })),
      };
    }
  }
  return { business, users: userList, salesmen: sms, routes, audit, closings, accounts: accs, warehouses: whs, branches: brs, employees: staff, demo, mailbox, isDemoOwner };
});

export const POST = api(async ({ user, req }) => {
  const b = await body(req);
  if (!["owner", "manager"].includes(user.role) && !["add_account", "close_day", "set_biz_type", "signout_others"].includes(b.action)) {
    throw new BizError("Only owner/manager can change settings", 403);
  }
  if (b.action === "add_account" && !["owner", "manager", "accountant"].includes(user.role)) {
    throw new BizError("Only owner, manager or accountant can create accounts", 403);
  }
  switch (b.action) {
    case "update_business": {
      const logo = typeof b.logo === "string" && b.logo.length < 400000 ? b.logo : undefined;
      await db.update(businesses).set({
        name: b.name, phone: b.phone || null, address: b.address || null,
        taxPct: String(b.taxPct || 0), invoiceFooter: b.invoiceFooter || null,
        ...(b.bizType ? { bizType: String(b.bizType) } : {}),
        ...(logo !== undefined ? { logo: logo || null } : {}),
      }).where(eq(businesses.id, user.businessId));
      return { ok: true };
    }
    case "set_biz_type": {
      // Chosen in Inventory → Products; remembered for the whole business and changeable anytime (not locked).
      if (!["owner", "manager", "warehouse", "demo"].includes(user.role)) throw new BizError("Not allowed to change the business type", 403);
      if (!b.bizType) throw new BizError("Business type is required");
      await db.update(businesses).set({ bizType: String(b.bizType) }).where(eq(businesses.id, user.businessId));
      return { ok: true };
    }
    case "add_user": {
      if (!b.name || !b.email || !b.password) throw new BizError("Name, email and password are required");
      const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, String(b.email).toLowerCase().trim())).limit(1);
      if (dup.length) throw new BizError("That email is already registered");
      await db.insert(users).values({ businessId: user.businessId, name: b.name, email: String(b.email).toLowerCase().trim(), passwordHash: hashPassword(b.password), role: b.role || "salesman", phone: b.phone || null });
      return { ok: true };
    }
    case "toggle_user": {
      {
        const target = await db.select({ email: users.email, businessId: users.businessId }).from(users).where(eq(users.id, Number(b.id))).limit(1);
        const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
        if (dbz && target && target.businessId === dbz.id && target.email === "demo@afriditech.pk") {
          throw new BizError("The demo control account is permanent and cannot be disabled", 403);
        }
      }
      const [u] = await db.select().from(users).where(eq(users.id, Number(b.id))).limit(1);
      if (!u || u.businessId !== user.businessId) throw new BizError("User not found", 404);
      if (u.id === user.id) throw new BizError("You cannot deactivate your own account");
      await db.update(users).set({ active: !u.active }).where(eq(users.id, u.id));
      return { ok: true };
    }
    case "signout_others": {
      // self-scoped: every role may end its own other sessions, nobody else's
      const ended = await signOutOtherSessions(user.id);
      return { ok: true, ended };
    }
    case "update_user": {
      const [u] = await db.select().from(users).where(eq(users.id, Number(b.id))).limit(1);
      if (!u || u.businessId !== user.businessId) throw new BizError("User not found", 404);
      const name = String(b.name || "").trim(), email = String(b.email || "").toLowerCase().trim(), phone = String(b.phone || "").trim() || null;
      if (!name || !email) throw new BizError("Name and email are required");
      const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (dup.length && dup[0].id !== u.id) throw new BizError("That email is already registered");
      const patch = { name, email, phone };
      if (b.role && b.role !== u.role) {
        if (!["owner", "manager", "accountant", "salesman", "cashier", "warehouse"].includes(b.role)) throw new BizError("Unknown role");
        if (u.id === user.id) throw new BizError("You cannot change your own role");
        if (user.role !== "owner" && (u.role === "owner" || b.role === "owner")) throw new BizError("Only the owner can change owner accounts");
        const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
        if (dbz && u.businessId === dbz.id && u.email === "demo@afriditech.pk") throw new BizError("The demo control account's role is permanent");
        patch.role = b.role;
      }
      await db.update(users).set(patch).where(eq(users.id, u.id));
      await db.insert(auditLogs).values({ businessId: user.businessId, userId: user.id, action: `Updated user ${u.id} (${name} · ${email}${patch.role ? ` · role ${u.role}→${patch.role}` : ""})`, entityType: "user", entityId: u.id });
      return { ok: true };
    }
    case "add_salesman": {
      if (!b.name) throw new BizError("Name required");
      await db.insert(salesmen).values({ businessId: user.businessId, name: b.name, phone: b.phone || null, commissionType: b.commissionType || "none", commissionRate: String(b.commissionRate || 0) });
      return { ok: true };
    }
    case "add_account":
      return addAccount(user, b);
    case "add_employee": {
      if (!b.name?.trim()) throw new BizError("Employee name is required");
      const [row] = await db.insert(employees).values({
        businessId: user.businessId, name: String(b.name).trim(), phone: b.phone || null, role: b.role || null,
        salary: String(b.salary || 0), joiningDate: b.joiningDate || todayStr(), status: "active",
      }).returning({ id: employees.id });
      return { id: row.id };
    }
    case "pay_salary": {
      const [emp] = await db.select().from(employees).where(eq(employees.id, Number(b.employeeId))).limit(1);
      if (!emp || emp.businessId !== user.businessId) throw new BizError("Employee not found", 404);
      const salaryCat = (await db.select().from(expenseCategories).where(eq(expenseCategories.businessId, user.businessId))).find((c) => c.name.toLowerCase().includes("sal"));
      if (!salaryCat) throw new BizError("Create a 'Salaries' expense category first");
      await addExpense(user, {
        date: b.date || undefined, categoryId: salaryCat.id, amount: Number(b.amount), accountId: Number(b.accountId),
        description: `Salary — ${emp.name} (${b.month || "monthly"})`,
      });
      return { ok: true };
    }
    case "create_grant": {
      const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
      if (user.role !== "owner" || !dbz || user.businessId !== dbz.id) throw new BizError("Only the demo environment owner can manage demo access", 403);
      if (!b.clientName?.trim()) throw new BizError("Client name is required");
      const [demoBiz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
      if (!demoBiz) throw new BizError("Demo environment not available", 404);
      const code = "DEMO-" + randomBytes(4).toString("hex").toUpperCase();
      const days = [1, 7, 15, 30].includes(Number(b.expiresDays)) ? Number(b.expiresDays) : 7;
      const [g] = await db.insert(demoGrants).values({
        businessId: demoBiz.id, clientName: b.clientName.trim(), clientEmail: b.clientEmail || null,
        code, status: "active", note: b.note || null, createdBy: user.id,
        expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000),
      }).returning();
      await db.insert(auditLogs).values({ businessId: user.businessId, userId: user.id, action: `Demo access granted to ${g.clientName} (${code})`, entityType: "demo_grant", entityId: g.id });
      return { id: g.id, code };
    }
    case "set_grant_status": {
      {
        const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
        if (user.role !== "owner" || !dbz || user.businessId !== dbz.id) throw new BizError("Only the demo environment owner can manage demo access", 403);
      }
      const [g] = await db.select().from(demoGrants).where(eq(demoGrants.id, Number(b.id))).limit(1);
      if (!g) throw new BizError("Grant not found", 404);
      const status = b.status === "active" ? "active" : "revoked";
      await db.update(demoGrants).set({ status }).where(eq(demoGrants.id, g.id));
      if (status === "revoked") await db.update(sessions).set({ expiresAt: new Date() }).where(eq(sessions.grantId, g.id));
      return { ok: true };
    }
    case "delete_grant": {
      {
        const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
        if (user.role !== "owner" || !dbz || user.businessId !== dbz.id) throw new BizError("Only the demo environment owner can manage demo access", 403);
      }
      const id = Number(b.id);
      const [g] = await db.select().from(demoGrants).where(eq(demoGrants.id, id)).limit(1);
      if (!g) throw new BizError("Grant not found", 404);
      const demoEmail = `demo-grant-${id}@demo.local`;
      const [du] = await db.select({ id: users.id }).from(users).where(eq(users.email, demoEmail)).limit(1);
      try {
        await db.transaction(async (t) => {
          await t.delete(sessions).where(eq(sessions.grantId, id));
          if (du) {
            // release every FK reference to users.id (see schema) before removing the user
            await t.delete(sessions).where(eq(sessions.userId, du.id));
            await t.delete(passwordResets).where(eq(passwordResets.userId, du.id)); // user_id is NOT NULL
            await t.update(sales).set({ createdBy: null }).where(eq(sales.createdBy, du.id));
            await t.update(purchases).set({ createdBy: null }).where(eq(purchases.createdBy, du.id));
            await t.update(salesReturns).set({ createdBy: null }).where(eq(salesReturns.createdBy, du.id));
            await t.update(purchaseReturns).set({ createdBy: null }).where(eq(purchaseReturns.createdBy, du.id));
            await t.update(payments).set({ createdBy: null }).where(eq(payments.createdBy, du.id));
            await t.update(expenses).set({ createdBy: null }).where(eq(expenses.createdBy, du.id));
            await t.update(accountTransfers).set({ createdBy: null }).where(eq(accountTransfers.createdBy, du.id));
            await t.update(dayClosings).set({ closedBy: null }).where(eq(dayClosings.closedBy, du.id));
            await t.update(stockMovements).set({ userId: null }).where(eq(stockMovements.userId, du.id));
            await t.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, du.id));
            await t.delete(users).where(eq(users.id, du.id));
          }
          await t.delete(demoUsage).where(eq(demoUsage.grantId, id));
          await t.delete(demoGrants).where(eq(demoGrants.id, id));
        });
      } catch (e) {
        throw new BizError(`Could not delete this demo access: ${e?.message?.slice(0, 120) || "database error"}`, 409);
      }
      return { ok: true };
    }
    case "mark_mail_read": {
      {
        const [dbz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.isDemo, true)).limit(1);
        if (user.role !== "owner" || !dbz || user.businessId !== dbz.id) throw new BizError("Only the demo environment owner can manage demo access", 403);
      }
      await db.update(ownerMailbox).set({ read: true }).where(and(eq(ownerMailbox.id, Number(b.id))));
      return { ok: true };
    }
    case "add_warehouse": {
      if (!b.name?.trim()) throw new BizError("Warehouse name is required");
      const exists = await db.select({ name: warehouses.name }).from(warehouses).where(eq(warehouses.businessId, user.businessId));
      if (exists.some((w) => w.name.toLowerCase() === String(b.name).trim().toLowerCase())) throw new BizError("A warehouse with that name already exists");
      const [row] = await db.insert(warehouses).values({ businessId: user.businessId, branchId: b.branchId || null, name: String(b.name).trim(), isMain: false }).returning({ id: warehouses.id });
      return { id: row.id };
    }
    case "close_day": {
      if (!canOverride(user.role) && !["cashier", "accountant"].includes(user.role)) throw new BizError("Not authorized", 403);
      await closeDay(user, b);
      return { ok: true };
    }
    default:
      throw new BizError("Unknown action");
  }
});
