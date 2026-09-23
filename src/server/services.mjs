// Business service layer. All financial operations run in DB transactions.
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { BizError, canOverride, n0, r2, todayStr, addDays, weekMonday } from "./util.mjs";

const B = (user) => user.businessId;

// ---------- doc numbering ----------
async function nextDocNo(t, businessId, key, prefix) {
  const rows = await t.select().from(s.docSequences).where(and(eq(s.docSequences.businessId, businessId), eq(s.docSequences.key, key))).for("update").limit(1);
  const year = new Date().getFullYear();
  if (!rows.length) {
    await t.insert(s.docSequences).values({ businessId, key, prefix, lastNumber: 1 });
    return `${prefix}-${year}-000001`;
  }
  const next = rows[0].lastNumber + 1;
  await t.update(s.docSequences).set({ lastNumber: next }).where(eq(s.docSequences.id, rows[0].id));
  return `${prefix}-${year}-${String(next).padStart(6, "0")}`;
}

// ---------- journal ----------
async function postJournal(t, businessId, { date, refType, refId, memo, lines }) {
  const [entry] = await t
    .insert(s.journalEntries)
    .values({ businessId, date, refType, refId, memo })
    .returning({ id: s.journalEntries.id });
  const mapped = lines.filter((l) => n0(l.debit) > 0 || n0(l.credit) > 0).map((l) => ({
    entryId: entry.id,
    accountCode: l.code,
    entityId: l.entityId || null,
    debit: String(r2(l.debit || 0)),
    credit: String(r2(l.credit || 0)),
  }));
  if (mapped.length) await t.insert(s.journalLines).values(mapped);
}

async function audit(t, user, action, entityType, entityId, extra = {}) {
  await t.insert(s.auditLogs).values({
    businessId: B(user), userId: user.id, action, entityType, entityId,
    oldValues: extra.old ? JSON.stringify(extra.old) : null,
    newValues: extra.new ? JSON.stringify(extra.new) : null,
    reason: extra.reason || null,
  });
}

async function notify(t, businessId, type, title, body) {
  await t.insert(s.notifications).values({ businessId, type, title, body });
}

// Tenant guard: every warehouse touched by an operation must belong to THIS business.
async function assertWarehouse(t, businessId, warehouseId) {
  const rows = await t.select({ id: s.warehouses.id }).from(s.warehouses)
    .where(and(eq(s.warehouses.id, Number(warehouseId)), eq(s.warehouses.businessId, businessId))).limit(1);
  if (!rows.length) throw new BizError("Warehouse not found", 404);
}

async function getStockRow(t, businessId, productId, warehouseId) {
  const rows = await t
    .select().from(s.stock)
    .where(and(eq(s.stock.businessId, businessId), eq(s.stock.productId, productId), eq(s.stock.warehouseId, warehouseId)))
    .for("update").limit(1);
  return rows[0] || null;
}

async function moveStock(t, businessId, productId, warehouseId, delta, type, ref, user, reason) {
  const row = await getStockRow(t, businessId, productId, warehouseId);
  const prev = row ? n0(row.qty) : 0;
  const newQty = r2(prev + delta);
  if (row) {
    await t.update(s.stock).set({ qty: String(newQty) }).where(eq(s.stock.id, row.id));
  } else {
    await t.insert(s.stock).values({ businessId, productId, warehouseId, qty: String(newQty), avgCost: "0" });
  }
  await t.insert(s.stockMovements).values({
    businessId, productId, warehouseId, type, qty: String(delta), prevQty: String(prev), newQty: String(newQty),
    refType: ref?.type || null, refId: ref?.id || null, refNo: ref?.no || null, reason: reason || null, userId: user.id,
  });
  return { prev, newQty, avgCost: row ? n0(row.avgCost) : 0 };
}

// FIFO allocation of an amount against unpaid docs; every applied slice is
// recorded in payment_allocations so payments stay fully traceable/reversible.
async function allocateFifo(t, businessId, partyType, amount, paymentId, preferredDocId) {
  let remaining = r2(amount);
  const table = partyType === "customer" ? s.sales : s.purchases;
  const docType = partyType === "customer" ? "sale" : "purchase";
  const order = [];
  if (preferredDocId) order.push(preferredDocId);
  const open = await t.select({ id: table.id, balance: table.balance })
    .from(table)
    .where(and(eq(table.businessId, businessId), eq(table.status, "final"), sql`${table.balance} > 0`))
    .orderBy(asc(table.date), asc(table.id));
  const sorted = [...open.filter((o) => order.includes(o.id)), ...open.filter((o) => !order.includes(o.id))];
  for (const doc of sorted) {
    if (remaining <= 0) break;
    const bal = n0(doc.balance);
    if (bal <= 0) continue;
    const applied = r2(Math.min(bal, remaining));
    await t.update(table).set({ balance: String(r2(bal - applied)), paid: sql`${table.paid}::numeric + ${applied}` }).where(eq(table.id, doc.id));
    await t.insert(s.paymentAllocations).values({ paymentId, docType, docId: doc.id, amount: String(applied) });
    remaining = r2(remaining - applied);
  }
  return r2(amount - remaining);
}

async function createChequeRow(t, businessId, direction, partyType, partyId, ch, paymentId) {
  const [row] = await t.insert(s.cheques).values({
    businessId, direction, partyType, partyId, bank: ch.bank || null, chequeNo: ch.chequeNo || null,
    amount: String(r2(ch.amount)), issueDate: ch.issueDate || todayStr(), expectedDate: ch.expectedDate || null,
    status: "pending", paymentId, notes: ch.notes || null,
  }).returning({ id: s.cheques.id });
  return row.id;
}

// ================= REGISTRATION (new business, fresh books) =================
export async function registerBusiness({ businessName, ownerName, email, phone, passwordHash }) {
  return db.transaction(async (t) => {
    const emailNorm = String(email).toLowerCase().trim();
    const dup = await t.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, emailNorm)).limit(1);
    if (dup.length) throw new BizError("An account with this email already exists — please sign in instead");
    const [biz] = await t.insert(s.businesses).values({
      name: businessName.trim(), phone: phone || null, currency: "PKR", taxPct: "0",
      invoiceFooter: "Shukriya! Thank you for your business.",
    }).returning({ id: s.businesses.id });
    const [owner] = await t.insert(s.users).values({
      businessId: biz.id, name: ownerName.trim(), email: emailNorm, passwordHash, role: "owner", phone: phone || null,
    }).returning({ id: s.users.id });
    const [branch] = await t.insert(s.branches).values({ businessId: biz.id, name: "Main Branch" }).returning({ id: s.branches.id });
    await t.insert(s.warehouses).values({ businessId: biz.id, branchId: branch.id, name: "Main Shop", isMain: true });
    await t.insert(s.accounts).values({ businessId: biz.id, type: "cash", name: "Main Cash", openingBalance: "0", balance: "0" });
    await t.insert(s.expenseCategories).values(
      ["Shop Rent", "Electricity", "Salaries", "Transport / Loading", "Fuel", "Internet & Phone", "Maintenance", "Packaging", "Chai / Food", "Miscellaneous"]
        .map((name) => ({ businessId: biz.id, name }))
    );
    await t.insert(s.notifications).values({
      businessId: biz.id, type: "welcome", title: `Welcome, ${ownerName.trim()}!`,
      body: "Add your first fabric in Inventory, your first customer in Customers, then start billing.",
    });
    return { businessId: biz.id, userId: owner.id };
  });
}

// ================= SALES =================
export async function createSale(user, input) {
  const { customerId, warehouseId, salesmanId, date, lines, notes } = input;
  if (!customerId || !warehouseId) throw new BizError("Customer and warehouse are required");
  if (!Array.isArray(lines) || !lines.length) throw new BizError("Invoice must have at least one item");
  const docDate = date || todayStr();
  const isBackdated = docDate < todayStr();

  return db.transaction(async (t) => {
    const [customer] = await t.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.businessId, B(user)))).limit(1);
    if (!customer) throw new BizError("Customer not found", 404);
    await assertWarehouse(t, B(user), warehouseId);
    const [closed] = await t.select().from(s.dayClosings).where(and(eq(s.dayClosings.businessId, B(user)), eq(s.dayClosings.date, docDate))).limit(1);
    if (closed && !canOverride(user.role)) throw new BizError(`Day ${docDate} is closed. Only owner/manager can post backdated entries.`);

    const invoiceNo = await nextDocNo(t, B(user), "INV", "INV");
    const gstMode = ["none", "intra", "inter"].includes(input.gstMode) ? input.gstMode : "none";
    const saleKind = input.saleKind === "retail" ? "retail" : "wholesale";
    const items = [];
    let subtotal = 0, cogsTotal = 0, gstTotal = 0;

    for (const line of lines) {
      const qty = r2(line.qty); const rate = r2(line.rate); const disc = r2(line.discount || 0);
      if (qty <= 0 || rate < 0) throw new BizError("Each line needs a positive quantity and a valid rate");
      const [product] = await t.select().from(s.products).where(and(eq(s.products.id, line.productId), eq(s.products.businessId, B(user)))).limit(1);
      if (!product) throw new BizError("Product not found");
      if (product.notForSale) throw new BizError(`${product.name} is marked “Not for sale” — remove it from the bill`);
      // inventory sources stay separate: manual retail stock sells only in retail mode, from the Retail Shop
      if ((product.source || "wholesale") === "retail") {
        if (saleKind !== "retail") throw new BizError(`${product.name} is a manual retail product — sell it in Retail mode`);
        const [wh] = await t.select().from(s.warehouses).where(eq(s.warehouses.id, warehouseId)).limit(1);
        if (wh?.code !== "RETAIL") throw new BizError(`${product.name} must be sold from the Retail Shop godown`);
      }
      const minP = n0(product.minPrice);
      if (minP > 0 && rate < minP && !(input.overridePrice && canOverride(user.role))) {
        throw new BizError(`${product.name}: rate Rs ${rate} is below the minimum price Rs ${minP}. Owner/manager can override.`);
      }
      const st = await moveStock(t, B(user), product.id, warehouseId, -qty, "sale", { type: "sale", no: invoiceNo }, user);
      if (st.newQty < 0 && !input.allowNegative) {
        throw new BizError(`Insufficient stock for ${product.name} (${product.color || ""}). Available: ${st.prev} ${product.unit}`);
      }
      if (st.newQty < 0 && !canOverride(user.role) && !input.overrideCredit) {
        throw new BizError(`Negative stock for ${product.name} requires manager approval`);
      }
      const lineTotal = r2(qty * rate - disc);
      // GST is computed server-side from the product master — never trusted from the client
      const lineGst = gstMode === "none" ? 0 : r2(lineTotal * n0(product.gstRate) / 100);
      gstTotal = r2(gstTotal + lineGst);
      const costRate = st.avgCost || n0(product.costPrice);
      cogsTotal = r2(cogsTotal + qty * costRate);
      subtotal = r2(subtotal + lineTotal);
      items.push({ productId: product.id, qty: String(qty), rate: String(rate), discount: String(disc), total: String(lineTotal), costRate: String(costRate) });
    }

    const discount = r2(Math.min(input.discount || 0, subtotal));
    const taxable = r2(subtotal - discount);
    const tax = gstTotal; // GST amount; kept in the existing tax column
    const total = r2(taxable + tax);
    const paid = r2(Math.min(input.paid || 0, total));
    const remaining = r2(total - paid);
    const prevBalance = n0(customer.balance);
    // Walk-in counter customers carry no khata — ANY sale to them (retail or
    // wholesale mode) must be paid in full.
    if (customer.code === "WALKIN" && remaining > 0) {
      throw new BizError("Walk-in retail sales must be paid in full — collect the full amount.");
    }

    if (remaining > 0 && n0(customer.creditLimit) > 0 && r2(prevBalance + remaining) > n0(customer.creditLimit)) {
      const over = r2(prevBalance + remaining - n0(customer.creditLimit));
      if (!input.overrideCredit || !canOverride(user.role)) {
        throw new BizError(`Cannot create credit sale. Customer credit limit exceeded by Rs ${over.toLocaleString()}. Available credit: Rs ${r2(n0(customer.creditLimit) - prevBalance).toLocaleString()}`);
      }
      await audit(t, user, "Credit limit override", "customer", customer.id, {
        reason: input.overrideReason || "Authorized override",
        new: { limit: n0(customer.creditLimit), newBalance: r2(prevBalance + remaining), overBy: over },
      });
    }

    const [sale] = await t.insert(s.sales).values({
      businessId: B(user), invoiceNo, date: docDate, customerId, salesmanId: salesmanId || null,
      warehouseId, subtotal: String(subtotal), discount: String(discount), tax: String(tax), total: String(total),
      paid: String(paid), balance: String(remaining), prevBalance: String(prevBalance), status: "final",
      gstMode, saleKind, isBackdated, notes: notes || null, createdBy: user.id,
    }).returning({ id: s.sales.id });

    await t.insert(s.saleItems).values(items.map((i) => ({ ...i, saleId: sale.id })));

    let paymentId = null, receiptNo = null, accCode = "CASH";
    if (paid > 0) {
      receiptNo = await nextDocNo(t, B(user), "REC", "REC");
      const [acc] = await t.select().from(s.accounts).where(and(eq(s.accounts.id, input.accountId), eq(s.accounts.businessId, B(user)))).for("update").limit(1);
      if (!acc) throw new BizError("Payment account is required when amount is received");
      accCode = acc.type === "bank" ? "BANK" : "CASH";
      const [pay] = await t.insert(s.payments).values({
        businessId: B(user), receiptNo, date: docDate, partyType: "customer", partyId: customerId,
        amount: String(paid), method: input.method || "cash", accountId: acc.id, salesmanId: salesmanId || null,
        kind: "sale", notes: notes || null, createdBy: user.id,
      }).returning({ id: s.payments.id });
      paymentId = pay.id;
      if ((input.method || "cash") === "cheque" && input.cheque) {
        const chq = await createChequeRow(t, B(user), "in", "customer", customerId, { ...input.cheque, amount: paid }, paymentId);
        await t.update(s.payments).set({ chequeId: chq }).where(eq(s.payments.id, paymentId));
      }
      await t.insert(s.paymentAllocations).values({ paymentId, docType: "sale", docId: sale.id, amount: String(paid) });
      await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric + ${paid}` }).where(eq(s.accounts.id, acc.id));
    }

    if (remaining > 0) {
      await t.update(s.customers).set({ balance: sql`${s.customers.balance}::numeric + ${remaining}` }).where(eq(s.customers.id, customerId));
    }

    await postJournal(t, B(user), {
      date: docDate, refType: "sale", refId: sale.id, memo: `Sale ${invoiceNo} — ${customer.name}`,
      lines: [
        { code: "AR", entityId: customerId, debit: remaining },
        { code: accCode, entityId: input.accountId || null, debit: paid },
        { code: "SALES", credit: total },
        { code: "COGS", debit: cogsTotal },
        { code: "INVENTORY", credit: cogsTotal },
      ],
    });
    if (isBackdated) await audit(t, user, "Backdated sale", "sale", sale.id, { new: { date: docDate, entered: todayStr() } });
    return { id: sale.id, invoiceNo, total, paid, remaining, receiptNo };
  });
}

export async function voidSale(user, saleId, reason) {
  if (!canOverride(user.role)) throw new BizError("Only owner/manager can void invoices", 403);
  return db.transaction(async (t) => {
    const [sale] = await t.select().from(s.sales).where(and(eq(s.sales.id, saleId), eq(s.sales.businessId, B(user)))).for("update").limit(1);
    if (!sale) throw new BizError("Invoice not found", 404);
    if (sale.status === "void") throw new BizError("Invoice already void");
    const items = await t.select().from(s.saleItems).where(eq(s.saleItems.saleId, saleId));
    for (const it of items) {
      await moveStock(t, B(user), it.productId, sale.warehouseId, n0(it.qty), "sale_return", { type: "void", id: sale.id, no: sale.invoiceNo }, user, `Void ${sale.invoiceNo}`);
    }
    // remove this invoice's remaining debt from the khata
    const outstanding = n0(sale.balance);
    if (outstanding !== 0) await t.update(s.customers).set({ balance: sql`${s.customers.balance}::numeric - ${outstanding}` }).where(eq(s.customers.id, sale.customerId));
    // refund exactly the rupees received against THIS invoice — allocation slice by slice.
    // Payments that also settled other invoices keep their other allocations intact.
    const allocs = await t.select().from(s.paymentAllocations)
      .where(and(eq(s.paymentAllocations.docType, "sale"), eq(s.paymentAllocations.docId, saleId), eq(s.paymentAllocations.status, "final")));
    let refunded = 0;
    const refundByAcc = [];
    for (const alloc of allocs) {
      const amt = n0(alloc.amount);
      if (amt <= 0) continue;
      const [pay] = await t.select().from(s.payments).where(eq(s.payments.id, alloc.paymentId)).for("update").limit(1);
      if (!pay || pay.status !== "final") continue;
      refunded = r2(refunded + amt);
      // keep the row for the audit trail — mark the slice refunded
      await t.update(s.paymentAllocations).set({ status: "void" }).where(eq(s.paymentAllocations.id, alloc.id));
      const [rem] = await t.select({ n: sql`COUNT(*)` }).from(s.paymentAllocations).where(and(eq(s.paymentAllocations.paymentId, pay.id), eq(s.paymentAllocations.status, "final")));
      if (Number(rem.n) === 0) {
        await t.update(s.payments).set({ status: "void" }).where(eq(s.payments.id, pay.id));
      } else {
        await audit(t, user, `Partial refund ${amt} from ${pay.receiptNo} (void ${sale.invoiceNo})`, "payment", pay.id, { old: { allocated: n0(pay.amount) }, new: { refunded: amt }, reason });
      }
      await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric - ${amt}` }).where(eq(s.accounts.id, pay.accountId));
      const [refAcc] = await t.select().from(s.accounts).where(eq(s.accounts.id, pay.accountId)).limit(1);
      refundByAcc.push({ code: refAcc?.type === "bank" ? "BANK" : "CASH", entityId: pay.accountId, amt });
    }
    await t.update(s.sales).set({ status: "void", balance: "0", voidReason: reason || null }).where(eq(s.sales.id, saleId));
    const cogsTotal = r2(items.reduce((a, i) => a + n0(i.qty) * n0(i.costRate), 0));
    await postJournal(t, B(user), {
      date: todayStr(), refType: "void_sale", refId: saleId, memo: `Void ${sale.invoiceNo}: ${reason || ""}`,
      lines: [
        { code: "SALES", debit: n0(sale.total) },
        { code: "AR", entityId: sale.customerId, credit: outstanding },
        ...refundByAcc.map((x) => ({ code: x.code, entityId: x.entityId, credit: x.amt })),
        { code: "INVENTORY", debit: cogsTotal },
        { code: "COGS", credit: cogsTotal },
      ],
    });
    await audit(t, user, `Voided invoice ${sale.invoiceNo}`, "sale", saleId, { old: { total: n0(sale.total), status: "final" }, new: { status: "void", refunded }, reason });
  });
}

// ================= PAYMENTS (customer receipts + supplier payments) =================
export async function recordPayment(user, input) {
  const { partyType, partyId, date, accountId, scheduleId } = input;
  const amount = r2(input.amount);
  if (amount <= 0) throw new BizError("Amount must be greater than zero");
  if (!["customer", "supplier"].includes(partyType)) throw new BizError("Invalid party type");
  const docDate = date || todayStr();

  return db.transaction(async (t) => {
    const [acc] = await t.select().from(s.accounts).where(and(eq(s.accounts.id, accountId), eq(s.accounts.businessId, B(user)))).for("update").limit(1);
    if (!acc) throw new BizError("Select a cash/bank account", 404);
    const partyTable = partyType === "customer" ? s.customers : s.suppliers;
    const [party] = await t.select().from(partyTable).where(and(eq(partyTable.id, partyId), eq(partyTable.businessId, B(user)))).for("update").limit(1);
    if (!party) throw new BizError(`${partyType === "customer" ? "Customer" : "Supplier"} not found`, 404);

    const receiptNo = await nextDocNo(t, B(user), partyType === "customer" ? "REC" : "SPAY", partyType === "customer" ? "REC" : "SPAY");
    const [pay] = await t.insert(s.payments).values({
      businessId: B(user), receiptNo, date: docDate, partyType, partyId, amount: String(amount),
      method: input.method || "cash", accountId: acc.id, scheduleId: scheduleId || null,
      salesmanId: input.salesmanId || null, refNo: input.refNo || null, notes: input.notes || null, createdBy: user.id,
    }).returning({ id: s.payments.id });

    let chequeId = null;
    if (input.method === "cheque" && input.cheque) {
      chequeId = await createChequeRow(t, B(user), partyType === "customer" ? "in" : "out", partyType, partyId, { ...input.cheque, amount }, pay.id);
      await t.update(s.payments).set({ chequeId }).where(eq(s.payments.id, pay.id));
    }

    await allocateFifo(t, B(user), partyType, amount, pay.id, input.docId || null);
    // khata always goes DOWN: customer owes less / we owe the supplier less
    await t.update(partyTable).set({ balance: sql`${partyTable.balance}::numeric - ${amount}` }).where(eq(partyTable.id, partyId));
    // money direction depends on party: customer receipt = cash IN, supplier payment = cash OUT
    if (partyType === "customer") {
      await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric + ${amount}` }).where(eq(s.accounts.id, acc.id));
    } else {
      await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric - ${amount}` }).where(eq(s.accounts.id, acc.id));
    }

    // Ograi attribution: a customer receipt always counts against his oldest open
    // weekly schedule (unless the user picked a specific week). The schedule only
    // tracks progress up to its expected amount — anything above that simply keeps
    // reducing the khata.
    let schedId = scheduleId ? Number(scheduleId) : null;
    if (partyType === "customer" && !schedId) {
      const [openSch] = await t.select().from(s.collectionSchedules)
        .where(and(
          eq(s.collectionSchedules.businessId, B(user)),
          eq(s.collectionSchedules.customerId, partyId),
          sql`${s.collectionSchedules.collected}::numeric < ${s.collectionSchedules.expected}::numeric`
        ))
        .orderBy(asc(s.collectionSchedules.weekStart)).limit(1);
      if (openSch) schedId = openSch.id;
    }
    if (schedId) {
      // tenant guard: the schedule must belong to this business AND to this customer
      const [sch] = await t.select().from(s.collectionSchedules)
        .where(and(eq(s.collectionSchedules.id, schedId), eq(s.collectionSchedules.businessId, B(user)), eq(s.collectionSchedules.customerId, partyId)))
        .for("update").limit(1);
      if (!sch) throw new BizError("Collection schedule not found for this customer", 404);
      const applied = r2(Math.min(amount, Math.max(0, n0(sch.expected) - n0(sch.collected))));
      if (applied > 0) {
        await t.update(s.collectionSchedules).set({ collected: String(r2(n0(sch.collected) + applied)) }).where(eq(s.collectionSchedules.id, schedId));
      }
    }

    await postJournal(t, B(user), {
      date: docDate, refType: "payment", refId: pay.id,
      memo: `${partyType === "customer" ? "Receipt" : "Payment"} ${receiptNo} — ${party.name}`,
      lines: partyType === "customer"
        ? [
            { code: acc.type === "bank" ? "BANK" : "CASH", entityId: acc.id, debit: amount },
            { code: "AR", entityId: partyId, credit: amount },
          ]
        : [
            { code: "AP", entityId: partyId, debit: amount },
            { code: acc.type === "bank" ? "BANK" : "CASH", entityId: acc.id, credit: amount },
          ],
    });
    if (amount >= 500000) await notify(t, B(user), "large_transaction", `Large ${partyType} payment Rs ${amount.toLocaleString()}`, `${party.name} — ${receiptNo}`);
    return { id: pay.id, receiptNo, amount, newBalance: r2(n0(party.balance) - amount), chequeId };
  });
}

// ================= PURCHASES =================
export async function createPurchase(user, input) {
  const { supplierId, warehouseId, date, lines } = input;
  if (!supplierId || !warehouseId) throw new BizError("Supplier and warehouse are required");
  if (!Array.isArray(lines) || !lines.length) throw new BizError("Purchase must have at least one item");
  const docDate = date || todayStr();

  const extraCost = r2(input.extraCost || 0);
  if (extraCost < 0) throw new BizError("Extra/landing cost cannot be negative");

  return db.transaction(async (t) => {
    const [supplier] = await t.select().from(s.suppliers).where(and(eq(s.suppliers.id, supplierId), eq(s.suppliers.businessId, B(user)))).limit(1);
    if (!supplier) throw new BizError("Supplier not found", 404);
    await assertWarehouse(t, B(user), warehouseId);
    const purchaseNo = await nextDocNo(t, B(user), "PUR", "PUR");

    // pass 1: validate lines + raw subtotal (extra/landing cost is apportioned by line value)
    const parsed = [];
    let subtotal = 0;
    for (const line of lines) {
      const qty = r2(line.qty); const rate = r2(line.rate);
      if (qty <= 0 || rate < 0) throw new BizError("Each line needs a positive quantity and rate");
      const [product] = await t.select().from(s.products).where(and(eq(s.products.id, line.productId), eq(s.products.businessId, B(user)))).limit(1);
      if (!product) throw new BizError("Product not found");
      if ((product.source || "wholesale") === "retail") {
        throw new BizError(`${product.name} is a manual retail product — stock it via the Retail flow, not wholesale purchases`);
      }
      const lineTotal = r2(qty * rate);
      subtotal = r2(subtotal + lineTotal);
      parsed.push({ product, qty, rate, lineTotal });
    }

    // pass 2: apply stock with landed cost (rate + apportioned extra cost), movements keep pure rate visible
    const items = [];
    for (const { product, qty, rate, lineTotal } of parsed) {
      const landedShare = subtotal > 0 ? extraCost * (lineTotal / subtotal) : 0; // Rs of extra cost on this line
      const landedRate = qty > 0 ? r2(rate + landedShare / qty) : rate; // effective cost per unit
      const row = await getStockRow(t, B(user), product.id, warehouseId);
      const prevQty = row ? n0(row.qty) : 0;
      const prevCost = row ? n0(row.avgCost) : n0(product.costPrice);
      const newQty = r2(prevQty + qty);
      const newCost = newQty > 0 ? r2((prevQty * prevCost + qty * landedRate) / newQty) : landedRate;
      if (row) await t.update(s.stock).set({ qty: String(newQty), avgCost: String(newCost) }).where(eq(s.stock.id, row.id));
      else await t.insert(s.stock).values({ businessId: B(user), productId: product.id, warehouseId, qty: String(newQty), avgCost: String(newCost) });
      await t.insert(s.stockMovements).values({
        businessId: B(user), productId: product.id, warehouseId, type: "purchase", qty: String(qty),
        prevQty: String(prevQty), newQty: String(newQty), refType: "purchase", refNo: purchaseNo, userId: user.id,
        reason: extraCost > 0 ? `incl. landing ${r2(landedRate - rate)}/unit` : null,
      });
      items.push({ productId: product.id, qty: String(qty), rate: String(rate), total: String(lineTotal) });
      // product cost reference keeps the PURE purchase rate — landed cost never overwrites it
      await t.update(s.products).set({ costPrice: String(rate) }).where(eq(s.products.id, product.id));
    }

    const discount = r2(Math.min(input.discount || 0, subtotal));
    const total = r2(subtotal - discount + extraCost);
    const paid = r2(Math.min(input.paid || 0, total));
    const remaining = r2(total - paid);

    const [purchase] = await t.insert(s.purchases).values({
      businessId: B(user), purchaseNo, refNo: input.refNo || null, date: docDate, supplierId, warehouseId,
      subtotal: String(subtotal), discount: String(discount), extraCost: String(extraCost), total: String(total), paid: String(paid),
      balance: String(remaining), status: "final", notes: input.notes || null, createdBy: user.id,
    }).returning({ id: s.purchases.id });
    await t.insert(s.purchaseItems).values(items.map((i) => ({ ...i, purchaseId: purchase.id })));

    let payAccCode = "CASH", payAccId = null;
    if (paid > 0) {
      const receiptNo = await nextDocNo(t, B(user), "SPAY", "SPAY");
      const [acc] = await t.select().from(s.accounts).where(and(eq(s.accounts.id, input.accountId), eq(s.accounts.businessId, B(user)))).for("update").limit(1);
      if (!acc) throw new BizError("Payment account required");
      payAccCode = acc.type === "bank" ? "BANK" : "CASH"; payAccId = acc.id;
      const [pay] = await t.insert(s.payments).values({
        businessId: B(user), receiptNo, date: docDate, partyType: "supplier", partyId: supplierId,
        amount: String(paid), method: input.method || "cash", accountId: acc.id, notes: input.notes || null, createdBy: user.id,
      }).returning({ id: s.payments.id });
      await t.insert(s.paymentAllocations).values({ paymentId: pay.id, docType: "purchase", docId: purchase.id, amount: String(paid) });
      await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric - ${paid}` }).where(eq(s.accounts.id, acc.id));
    }

    if (remaining > 0) await t.update(s.suppliers).set({ balance: sql`${s.suppliers.balance}::numeric + ${remaining}` }).where(eq(s.suppliers.id, supplierId));

    await postJournal(t, B(user), {
      date: docDate, refType: "purchase", refId: purchase.id, memo: `Purchase ${purchaseNo} — ${supplier.name}`,
      lines: [
        { code: "INVENTORY", debit: total },
        { code: "AP", entityId: supplierId, credit: remaining },
        { code: payAccCode, entityId: payAccId, credit: paid },
      ],
    });
    return { id: purchase.id, purchaseNo, total, paid, remaining };
  });
}

// ================= RETURNS =================
export async function createSalesReturn(user, input) {
  const { customerId, warehouseId, saleId, date, lines } = input;
  if (!customerId || !warehouseId || !Array.isArray(lines) || !lines.length) throw new BizError("Customer, warehouse and items are required");
  const docDate = date || todayStr();
  return db.transaction(async (t) => {
    const [customer] = await t.select().from(s.customers).where(and(eq(s.customers.id, customerId), eq(s.customers.businessId, B(user)))).limit(1);
    if (!customer) throw new BizError("Customer not found", 404);
    await assertWarehouse(t, B(user), warehouseId);
    const returnNo = await nextDocNo(t, B(user), "RET", "RET");
    let total = 0, costTotal = 0;
    const items = [];
    let origItems = [];
    if (saleId) origItems = await t.select().from(s.saleItems).where(eq(s.saleItems.saleId, saleId));
    for (const line of lines) {
      const qty = r2(line.qty); const rate = r2(line.rate);
      if (qty <= 0) throw new BizError("Return quantity must be positive");
      const [product] = await t.select().from(s.products).where(and(eq(s.products.id, line.productId), eq(s.products.businessId, B(user)))).limit(1);
      if (!product) throw new BizError("Product not found");
      await moveStock(t, B(user), product.id, warehouseId, qty, "sale_return", { type: "sales_return", no: returnNo }, user, input.reason || null);
      const orig = origItems.find((o) => o.productId === product.id);
      const costRate = orig ? n0(orig.costRate) : n0(product.costPrice);
      const lineTotal = r2(qty * rate);
      total = r2(total + lineTotal);
      costTotal = r2(costTotal + qty * costRate);
      items.push({ productId: product.id, qty: String(qty), rate: String(rate), total: String(lineTotal), costRate: String(costRate) });
    }
    const [ret] = await t.insert(s.salesReturns).values({
      businessId: B(user), returnNo, date: docDate, customerId, saleId: saleId || null, warehouseId,
      total: String(total), status: "final", reason: input.reason || null, notes: input.notes || null, createdBy: user.id,
    }).returning({ id: s.salesReturns.id });
    await t.insert(s.salesReturnItems).values(items.map((i) => ({ ...i, returnId: ret.id })));
    await t.update(s.customers).set({ balance: sql`${s.customers.balance}::numeric - ${total}` }).where(eq(s.customers.id, customerId));
    if (saleId) {
      const [sale] = await t.select({ id: s.sales.id, balance: s.sales.balance }).from(s.sales).where(eq(s.sales.id, saleId)).limit(1);
      if (sale) await t.update(s.sales).set({ balance: String(Math.max(0, r2(n0(sale.balance) - total))) }).where(eq(s.sales.id, saleId));
    }
    await postJournal(t, B(user), {
      date: docDate, refType: "sales_return", refId: ret.id, memo: `Sales return ${returnNo} — ${customer.name}`,
      lines: [
        { code: "SALES_RET", debit: total },
        { code: "AR", entityId: customerId, credit: total },
        { code: "INVENTORY", debit: costTotal },
        { code: "COGS", credit: costTotal },
      ],
    });
    return { id: ret.id, returnNo, total };
  });
}

export async function createPurchaseReturn(user, input) {
  const { supplierId, warehouseId, purchaseId, date, lines } = input;
  if (!supplierId || !warehouseId || !Array.isArray(lines) || !lines.length) throw new BizError("Supplier, warehouse and items are required");
  const docDate = date || todayStr();
  return db.transaction(async (t) => {
    const [supplier] = await t.select().from(s.suppliers).where(and(eq(s.suppliers.id, supplierId), eq(s.suppliers.businessId, B(user)))).limit(1);
    if (!supplier) throw new BizError("Supplier not found", 404);
    await assertWarehouse(t, B(user), warehouseId);
    const returnNo = await nextDocNo(t, B(user), "PRET", "PRET");
    let total = 0; const items = [];
    for (const line of lines) {
      const qty = r2(line.qty); const rate = r2(line.rate);
      if (qty <= 0) throw new BizError("Quantity must be positive");
      const st = await moveStock(t, B(user), line.productId, warehouseId, -qty, "purchase_return", { type: "purchase_return", no: returnNo }, user, input.reason || null);
      if (st.newQty < 0) throw new BizError("Cannot return more stock than available");
      const lineTotal = r2(qty * rate);
      total = r2(total + lineTotal);
      items.push({ productId: line.productId, qty: String(qty), rate: String(rate), total: String(lineTotal) });
    }
    const [ret] = await t.insert(s.purchaseReturns).values({
      businessId: B(user), returnNo, date: docDate, supplierId, purchaseId: purchaseId || null, warehouseId,
      total: String(total), status: "final", reason: input.reason || null, createdBy: user.id,
    }).returning({ id: s.purchaseReturns.id });
    await t.insert(s.purchaseReturnItems).values(items.map((i) => ({ ...i, returnId: ret.id })));
    await t.update(s.suppliers).set({ balance: sql`${s.suppliers.balance}::numeric - ${total}` }).where(eq(s.suppliers.id, supplierId));
    await postJournal(t, B(user), {
      date: docDate, refType: "purchase_return", refId: ret.id, memo: `Purchase return ${returnNo}`,
      lines: [{ code: "AP", entityId: supplierId, debit: total }, { code: "INVENTORY", credit: total }],
    });
    return { id: ret.id, returnNo, total };
  });
}

// ================= STOCK OPS =================
export async function adjustStock(user, input) {
  const { productId, warehouseId, reason } = input;
  const delta = r2(input.qtyDelta);
  if (!delta) throw new BizError("Quantity adjustment required");
  if (!reason) throw new BizError("Reason is required for stock adjustments");
  if (!["owner", "manager", "warehouse"].includes(user.role)) throw new BizError("Warehouse/manager role required", 403);
  return db.transaction(async (t) => {
    await assertWarehouse(t, B(user), warehouseId);
    // manual retail stock must never enter wholesale godowns
    const [prod] = await t.select({ source: s.products.source, name: s.products.name }).from(s.products).where(eq(s.products.id, Number(productId))).limit(1);
    if (prod?.source === "retail") {
      const [wh] = await t.select({ code: s.warehouses.code }).from(s.warehouses).where(eq(s.warehouses.id, Number(warehouseId))).limit(1);
      if (wh?.code !== "RETAIL") throw new BizError(`${prod.name} is a manual retail product — it can only hold stock in the Retail Shop`);
    }
    const type = delta > 0 ? (input.type === "opening" ? "opening" : "adjust_in") : (input.type === "damage" ? "damage" : "adjust_out");
    const st = await moveStock(t, B(user), productId, warehouseId, delta, type, { type: "adjustment" }, user, reason);
    if (st.newQty < 0) throw new BizError(`Adjustment would make stock negative (${st.prev} available)`);
    await audit(t, user, `Stock adjustment ${delta > 0 ? "+" : ""}${delta}`, "product", productId, { new: { prev: st.prev, now: st.newQty }, reason });
    return { prev: st.prev, now: st.newQty };
  });
}

export async function transferStock(user, input) {
  const { productId, fromWarehouseId, toWarehouseId } = input;
  const qty = r2(input.qty);
  if (qty <= 0) throw new BizError("Quantity must be positive");
  if (fromWarehouseId === toWarehouseId) throw new BizError("Source and destination must differ");
  return db.transaction(async (t) => {
    await assertWarehouse(t, B(user), fromWarehouseId);
    await assertWarehouse(t, B(user), toWarehouseId);
    // keep inventory sources separate: retail stock cannot move into wholesale godowns
    const [prod] = await t.select({ source: s.products.source, name: s.products.name }).from(s.products).where(eq(s.products.id, Number(productId))).limit(1);
    if (prod?.source === "retail") {
      const [toWh] = await t.select({ code: s.warehouses.code }).from(s.warehouses).where(eq(s.warehouses.id, Number(toWarehouseId))).limit(1);
      if (toWh?.code !== "RETAIL") throw new BizError(`${prod.name} is manual retail stock — it stays in the Retail Shop`);
    }
    const refNo = await nextDocNo(t, B(user), "TRF", "TRF");
    const st = await moveStock(t, B(user), productId, fromWarehouseId, -qty, "transfer_out", { type: "transfer", no: refNo }, user, input.reason || null);
    if (st.newQty < 0) throw new BizError(`Insufficient stock to transfer (${st.prev} available)`);
    const row = await getStockRow(t, B(user), productId, toWarehouseId);
    const cost = st.avgCost;
    const destPrev = row ? n0(row.qty) : 0;
    if (row) await t.update(s.stock).set({ qty: String(r2(destPrev + qty)) }).where(eq(s.stock.id, row.id));
    else await t.insert(s.stock).values({ businessId: B(user), productId, warehouseId: toWarehouseId, qty: String(qty), avgCost: String(cost) });
    await t.insert(s.stockMovements).values({
      businessId: B(user), productId, warehouseId: toWarehouseId, type: "transfer_in", qty: String(qty),
      prevQty: String(destPrev), newQty: String(r2(destPrev + qty)), refType: "transfer", refNo, userId: user.id,
    });
    return { refNo };
  });
}

// ================= OGRAI =================
// General rule: every credit customer owes 10% of his current outstanding
// balance as weekly ograi. A manual weekly amount on the customer overrides
// the 10% rule for that customer only.
export function ograiExpectedFor(balance, manualWeekly) {
  const manual = n0(manualWeekly);
  if (manual > 0) return r2(manual);
  const bal = n0(balance);
  if (bal <= 0) return 0;
  return r2(Math.round(bal * 0.1));
}

export async function generateSchedules(user, weeks = 1) {
  // single set-based INSERT per week — no per-customer round trips on page views
  const monday = weekMonday(todayStr());
  let created = 0;
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(monday, i * 7);
    const due = addDays(ws, 6);
    const res = await db.execute(sql`
      INSERT INTO collection_schedules (business_id, customer_id, week_start, due_date, expected, collected)
      SELECT ${B(user)}, c.id, ${ws}, ${due},
             CASE WHEN c.weekly_ograi::numeric > 0 THEN round(c.weekly_ograi::numeric, 2)
                  ELSE round(c.balance::numeric * 0.1) END, 0
      FROM customers c
      WHERE c.business_id = ${B(user)} AND c.status = 'active' AND c.balance::numeric > 0
      ON CONFLICT (customer_id, week_start) DO NOTHING`);
    created += res.rowCount || 0;
  }
  return created;
}

// Manual adjustment of a schedule's expected amount (audited)
export async function adjustSchedule(user, input) {
  if (!["owner", "manager", "accountant"].includes(user.role)) {
    throw new BizError("Only owner, manager or accountant can adjust ograi schedules", 403);
  }
  const expected = r2(input.expected);
  if (!(expected > 0)) throw new BizError("Expected amount must be greater than zero");
  return db.transaction(async (t) => {
    const [sch] = await t.select().from(s.collectionSchedules)
      .where(and(eq(s.collectionSchedules.id, Number(input.scheduleId)), eq(s.collectionSchedules.businessId, B(user))))
      .for("update").limit(1);
    if (!sch) throw new BizError("Schedule not found", 404);
    if (expected < n0(sch.collected)) throw new BizError(`Cannot set expected below already collected ${moneyOf(n0(sch.collected))}`);
    const [cust] = await t.select({ name: s.customers.name }).from(s.customers).where(eq(s.customers.id, sch.customerId)).limit(1);
    await t.update(s.collectionSchedules).set({ expected: String(expected) }).where(eq(s.collectionSchedules.id, sch.id));
    await audit(t, user, `Ograi adjusted for ${cust?.name || sch.customerId}`, "collection_schedule", sch.id,
      { old: { expected: n0(sch.expected) }, new: { expected }, reason: input.reason || "Manual adjustment" });
    return { id: sch.id, expected };
  });
}
const moneyOf = (v) => `Rs ${Number(v).toLocaleString()}`;

// ================= EMI / LOAN INSTALLMENT PLANS =================
export async function createInstallmentPlan(user, input) {
  const months = Math.min(Math.max(Number(input.months) || 1, 1), 24);
  return db.transaction(async (t) => {
    const [c] = await t.select().from(s.customers).where(and(eq(s.customers.id, Number(input.customerId)), eq(s.customers.businessId, B(user)))).limit(1);
    if (!c) throw new BizError("Customer not found", 404);
    const balance = n0(c.balance);
    if (balance <= 0) throw new BizError("This customer has no outstanding balance to convert into installments");
    const today = todayStr();
    const y0 = Number(today.slice(0, 4)), m0 = Number(today.slice(5, 7)) - 1;
    const installment = Math.floor((balance / months) * 100) / 100;
    let created = 0;
    for (let i = 0; i < months; i++) {
      const ws = new Date(Date.UTC(y0, m0 + i, 1)).toISOString().slice(0, 10); // month start
      const due = new Date(Date.UTC(y0, m0 + i + 1, 0)).toISOString().slice(0, 10); // month end
      const expected = i === months - 1 ? r2(balance - installment * (months - 1)) : installment;
      const res = await t.insert(s.collectionSchedules).values({
        businessId: B(user), customerId: c.id, weekStart: ws, dueDate: due, expected: String(expected), collected: "0",
      }).onConflictDoNothing().returning({ id: s.collectionSchedules.id });
      if (res.length) created++;
    }
    await audit(t, user, `EMI plan: ${months} installments of ~${moneyFmt(installment)}`, "customer", c.id, { new: { balance, months } });
    return { created, months, installment };
  });
}
const moneyFmt = (v) => `Rs ${Number(v).toLocaleString()}`;

// ================= EXPENSES / ACCOUNTS =================
export async function addExpense(user, input) {
  const amount = r2(input.amount);
  if (amount <= 0) throw new BizError("Amount must be greater than zero");
  const docDate = input.date || todayStr();
  return db.transaction(async (t) => {
    const [acc] = await t.select().from(s.accounts).where(and(eq(s.accounts.id, input.accountId), eq(s.accounts.businessId, B(user)))).for("update").limit(1);
    if (!acc) throw new BizError("Select an account");
    const [cat] = await t.select().from(s.expenseCategories).where(and(eq(s.expenseCategories.id, input.categoryId), eq(s.expenseCategories.businessId, B(user)))).limit(1);
    if (!cat) throw new BizError("Select an expense category");
    const [exp] = await t.insert(s.expenses).values({
      businessId: B(user), date: docDate, categoryId: cat.id, amount: String(amount), accountId: acc.id,
      description: input.description || null, createdBy: user.id,
    }).returning({ id: s.expenses.id });
    await t.update(s.accounts).set({ balance: sql`${s.accounts.balance}::numeric - ${amount}` }).where(eq(s.accounts.id, acc.id));
    await postJournal(t, B(user), {
      date: docDate, refType: "expense", refId: exp.id, memo: `${cat.name} expense`,
      lines: [{ code: "EXPENSE", entityId: cat.id, debit: amount }, { code: acc.type === "bank" ? "BANK" : "CASH", entityId: acc.id, credit: amount }],
    });
    return { id: exp.id };
  });
}

export async function addAccount(user, input) {
  return db.transaction(async (t) => {
    const opening = r2(input.openingBalance || 0);
    const [acc] = await t.insert(s.accounts).values({
      businessId: B(user), type: input.type === "bank" ? "bank" : "cash", name: input.name,
      bankName: input.bankName || null, accountNo: input.accountNo || null,
      openingBalance: String(opening), balance: String(opening),
    }).returning({ id: s.accounts.id });
    if (opening !== 0) {
      await postJournal(t, B(user), {
        date: todayStr(), refType: "opening", refId: acc.id, memo: `Opening balance ${input.name}`,
        lines: opening > 0
          ? [{ code: input.type === "bank" ? "BANK" : "CASH", entityId: acc.id, debit: opening }, { code: "CAPITAL", credit: opening }]
          : [{ code: "CAPITAL", debit: -opening }, { code: input.type === "bank" ? "BANK" : "CASH", entityId: acc.id, credit: -opening }],
      });
    }
    return { id: acc.id };
  });
}

export async function updateChequeStatus(user, chequeId, status, note) {
  const valid = ["pending", "deposited", "cleared", "bounced", "cancelled"];
  if (!valid.includes(status)) throw new BizError("Invalid cheque status");
  return db.transaction(async (t) => {
    const [chq] = await t.select().from(s.cheques).where(and(eq(s.cheques.id, chequeId), eq(s.cheques.businessId, B(user)))).limit(1);
    if (!chq) throw new BizError("Cheque not found", 404);
    await t.update(s.cheques).set({ status, notes: note || chq.notes }).where(eq(s.cheques.id, chequeId));
    if (status === "bounced") await notify(t, B(user), "cheque_bounced", `Cheque bounced — Rs ${n0(chq.amount).toLocaleString()}`, `Cheque #${chq.chequeNo || chq.id} (${chq.bank || ""})`);
    await audit(t, user, `Cheque status: ${status}`, "cheque", chequeId, { old: { status: chq.status }, new: { status } });
  });
}

export async function closeDay(user, input) {
  if (!canOverride(user.role) && !["cashier", "accountant"].includes(user.role)) throw new BizError("Not authorized", 403);
  const date = input.date || todayStr();
  return db.transaction(async (t) => {
    const existing = await t.select().from(s.dayClosings).where(and(eq(s.dayClosings.businessId, B(user)), eq(s.dayClosings.date, date))).limit(1);
    if (existing.length) throw new BizError(`Day ${date} is already closed`);
    const stats = await dailyStats(t, B(user), date);
    const [row] = await t.insert(s.dayClosings).values({
      businessId: B(user), date, openingCash: String(stats.openingCash), cashIn: String(stats.cashIn),
      cashOut: String(stats.cashOut), expectedCash: String(stats.expectedCash), actualCash: String(r2(input.actualCash || 0)),
      difference: String(r2(r2(input.actualCash || 0) - stats.expectedCash)), notes: input.notes || null, closedBy: user.id,
    }).returning({ id: s.dayClosings.id });
    await audit(t, user, `Closed day ${date}`, "day_closing", row.id, { new: { expected: stats.expectedCash, actual: input.actualCash } });
    return row;
  });
}

// ================= LEDGERS =================
export async function getPartyLedger(businessId, partyType, partyId) {
  const partyTable = partyType === "customer" ? s.customers : s.suppliers;
  const [party] = await db.select().from(partyTable).where(and(eq(partyTable.id, partyId), eq(partyTable.businessId, businessId))).limit(1);
  if (!party) throw new BizError("Not found", 404);
  const rows = [];
  const opening = n0(party.openingBalance);
  if (opening !== 0) rows.push({ date: "2000-01-01", createdAt: new Date(0), kind: "opening", desc: "Opening balance", debit: partyType === "customer" ? opening : 0, credit: partyType === "supplier" ? opening : 0, ref: null });

  if (partyType === "customer") {
    const [sales, pays, rets] = await Promise.all([
      db.select({ id: s.sales.id, no: s.sales.invoiceNo, date: s.sales.date, total: s.sales.total, status: s.sales.status, createdAt: s.sales.createdAt }).from(s.sales).where(and(eq(s.sales.businessId, businessId), eq(s.sales.customerId, partyId))),
      db.select({ id: s.payments.id, no: s.payments.receiptNo, date: s.payments.date, amount: s.payments.amount, method: s.payments.method, status: s.payments.status, createdAt: s.payments.createdAt }).from(s.payments).where(and(eq(s.payments.businessId, businessId), eq(s.payments.partyType, "customer"), eq(s.payments.partyId, partyId))),
      db.select({ id: s.salesReturns.id, no: s.salesReturns.returnNo, date: s.salesReturns.date, total: s.salesReturns.total, createdAt: s.salesReturns.createdAt }).from(s.salesReturns).where(and(eq(s.salesReturns.businessId, businessId), eq(s.salesReturns.customerId, partyId))),
    ]);
    for (const x of sales) if (x.status === "final") rows.push({ date: x.date, createdAt: x.createdAt, kind: "sale", desc: `Invoice ${x.no}`, debit: n0(x.total), credit: 0, ref: `/sales/${x.id}` });
    for (const x of pays) if (x.status === "final") rows.push({ date: x.date, createdAt: x.createdAt, kind: "payment", desc: `Payment ${x.no} (${x.method})`, debit: 0, credit: n0(x.amount), ref: null });
    for (const x of rets) rows.push({ date: x.date, createdAt: x.createdAt, kind: "return", desc: `Return ${x.no}`, debit: 0, credit: n0(x.total), ref: null });
  } else {
    const [purs, pays, rets] = await Promise.all([
      db.select({ id: s.purchases.id, no: s.purchases.purchaseNo, date: s.purchases.date, total: s.purchases.total, status: s.purchases.status, createdAt: s.purchases.createdAt }).from(s.purchases).where(and(eq(s.purchases.businessId, businessId), eq(s.purchases.supplierId, partyId))),
      db.select({ id: s.payments.id, no: s.payments.receiptNo, date: s.payments.date, amount: s.payments.amount, method: s.payments.method, status: s.payments.status, createdAt: s.payments.createdAt }).from(s.payments).where(and(eq(s.payments.businessId, businessId), eq(s.payments.partyType, "supplier"), eq(s.payments.partyId, partyId))),
      db.select({ id: s.purchaseReturns.id, no: s.purchaseReturns.returnNo, date: s.purchaseReturns.date, total: s.purchaseReturns.total, createdAt: s.purchaseReturns.createdAt }).from(s.purchaseReturns).where(and(eq(s.purchaseReturns.businessId, businessId), eq(s.purchaseReturns.supplierId, partyId))),
    ]);
    for (const x of purs) if (x.status === "final") rows.push({ date: x.date, createdAt: x.createdAt, kind: "purchase", desc: `Purchase ${x.no}`, debit: 0, credit: n0(x.total), ref: `/purchases/${x.id}` });
    for (const x of pays) if (x.status === "final") rows.push({ date: x.date, createdAt: x.createdAt, kind: "payment", desc: `Payment ${x.no} (${x.method})`, debit: n0(x.amount), credit: 0, ref: null });
    for (const x of rets) rows.push({ date: x.date, createdAt: x.createdAt, kind: "return", desc: `Return ${x.no}`, debit: n0(x.total), credit: 0, ref: null });
  }

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : new Date(a.createdAt) - new Date(b.createdAt)));
  let balance = 0;
  for (const r of rows) {
    balance = r2(balance + n0(r.debit) - n0(r.credit));
    r.balance = balance;
  }
  return { party, rows };
}

// ================= DAILY STATS / CLOSING =================
export async function dailyStats(_t, businessId, date) {
  const q = db;
  const D = "date::date";
  const [salesAgg, retAgg, purAgg, colAgg, supPayAgg, expAgg, accounts, cashInAgg, cashOutExp, cashOutSup] = await Promise.all([
    q.select({ total: sql`COALESCE(SUM(${s.sales.total}::numeric),0)`, paid: sql`COALESCE(SUM(${s.sales.paid}::numeric),0)` })
      .from(s.sales).where(and(eq(s.sales.businessId, businessId), eq(s.sales.date, date), eq(s.sales.status, "final"))),
    q.select({ total: sql`COALESCE(SUM(${s.salesReturns.total}::numeric),0)` })
      .from(s.salesReturns).where(and(eq(s.salesReturns.businessId, businessId), eq(s.salesReturns.date, date))),
    q.select({ total: sql`COALESCE(SUM(${s.purchases.total}::numeric),0)` })
      .from(s.purchases).where(and(eq(s.purchases.businessId, businessId), eq(s.purchases.date, date), eq(s.purchases.status, "final"))),
    q.select({ total: sql`COALESCE(SUM(${s.payments.amount}::numeric),0)` })
      .from(s.payments).where(and(eq(s.payments.businessId, businessId), eq(s.payments.date, date), eq(s.payments.partyType, "customer"), eq(s.payments.status, "final"), eq(s.payments.kind, "receipt"))),
    q.select({ total: sql`COALESCE(SUM(${s.payments.amount}::numeric),0)` })
      .from(s.payments).where(and(eq(s.payments.businessId, businessId), eq(s.payments.date, date), eq(s.payments.partyType, "supplier"), eq(s.payments.status, "final"))),
    q.select({ total: sql`COALESCE(SUM(${s.expenses.amount}::numeric),0)` })
      .from(s.expenses).where(and(eq(s.expenses.businessId, businessId), eq(s.expenses.date, date))),
    q.select().from(s.accounts).where(eq(s.accounts.businessId, businessId)),
    q.select({ total: sql`COALESCE(SUM(${s.payments.amount}::numeric),0)` })
      .from(s.payments).innerJoin(s.accounts, eq(s.accounts.id, s.payments.accountId))
      .where(and(eq(s.payments.businessId, businessId), eq(s.payments.date, date), eq(s.payments.status, "final"), eq(s.payments.partyType, "customer"), eq(s.accounts.type, "cash"))),
    q.select({ total: sql`COALESCE(SUM(${s.expenses.amount}::numeric),0)` })
      .from(s.expenses).innerJoin(s.accounts, eq(s.accounts.id, s.expenses.accountId))
      .where(and(eq(s.expenses.businessId, businessId), eq(s.expenses.date, date), eq(s.accounts.type, "cash"))),
    q.select({ total: sql`COALESCE(SUM(${s.payments.amount}::numeric),0)` })
      .from(s.payments).innerJoin(s.accounts, eq(s.accounts.id, s.payments.accountId))
      .where(and(eq(s.payments.businessId, businessId), eq(s.payments.date, date), eq(s.payments.status, "final"), eq(s.payments.partyType, "supplier"), eq(s.accounts.type, "cash"))),
  ]);
  const cash = accounts.filter((a) => a.type === "cash");
  const cashBalance = r2(cash.reduce((x, a) => x + n0(a.balance), 0));
  const cashOpening = r2(cash.reduce((x, a) => x + n0(a.openingBalance), 0));
  return {
    salesTotal: n0(salesAgg[0].total), cashSales: n0(salesAgg[0].paid), creditSales: r2(n0(salesAgg[0].total) - n0(salesAgg[0].paid)),
    returns: n0(retAgg[0].total), purchases: n0(purAgg[0].total), collections: n0(colAgg[0].total),
    supplierPayments: n0(supPayAgg[0].total), expenses: n0(expAgg[0].total),
    openingCash: cashOpening, cashIn: n0(cashInAgg[0].total), cashOut: r2(n0(cashOutExp[0].total) + n0(cashOutSup[0].total)), expectedCash: cashBalance,
  };
}

// ================= DASHBOARD =================
export async function dashboardData(user) {
  const b = B(user);
  const today = todayStr();
  const mStart = today.slice(0, 8) + "01";
  const [stats, recvAgg, payAgg, accounts, stockAgg, gpAgg, monthAgg, monthGp, monthExp, collectionsToday, weekAgg] = await Promise.all([
    dailyStats(db, b, today),
    db.select({ total: sql`COALESCE(SUM(${s.customers.balance}::numeric),0)` }).from(s.customers).where(and(eq(s.customers.businessId, b), sql`${s.customers.balance}::numeric > 0`)),
    db.select({ total: sql`COALESCE(SUM(${s.suppliers.balance}::numeric),0)` }).from(s.suppliers).where(and(eq(s.suppliers.businessId, b), sql`${s.suppliers.balance}::numeric > 0`)),
    db.select().from(s.accounts).where(eq(s.accounts.businessId, b)),
    db.select({ v: sql`COALESCE(SUM(${s.stock.qty}::numeric * ${s.stock.avgCost}::numeric),0)` }).from(s.stock).where(eq(s.stock.businessId, b)),
    db.select({ gp: sql`COALESCE(SUM((${s.saleItems.total}::numeric) - (${s.saleItems.qty}::numeric * ${s.saleItems.costRate}::numeric)),0)` })
      .from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId))
      .where(and(eq(s.sales.businessId, b), eq(s.sales.date, today), eq(s.sales.status, "final"))),
    db.select({ total: sql`COALESCE(SUM(${s.sales.total}::numeric),0)` }).from(s.sales).where(and(eq(s.sales.businessId, b), gte(s.sales.date, mStart), eq(s.sales.status, "final"))),
    db.select({ gp: sql`COALESCE(SUM((${s.saleItems.total}::numeric) - (${s.saleItems.qty}::numeric * ${s.saleItems.costRate}::numeric)),0)` })
      .from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId))
      .where(and(eq(s.sales.businessId, b), gte(s.sales.date, mStart), eq(s.sales.status, "final"))),
    db.select({ total: sql`COALESCE(SUM(${s.expenses.amount}::numeric),0)` }).from(s.expenses).where(and(eq(s.expenses.businessId, b), gte(s.expenses.date, mStart))),
    db.select({
      id: s.payments.id, no: s.payments.receiptNo, amount: s.payments.amount, method: s.payments.method, name: s.customers.name,
    }).from(s.payments).innerJoin(s.customers, eq(s.customers.id, s.payments.partyId))
      .where(and(eq(s.payments.businessId, b), eq(s.payments.date, today), eq(s.payments.partyType, "customer"), eq(s.payments.status, "final"), eq(s.payments.kind, "receipt")))
      .orderBy(desc(s.payments.amount)).limit(8),
    db.select({ expected: sql`COALESCE(SUM(${s.collectionSchedules.expected}::numeric),0)`, collected: sql`COALESCE(SUM(${s.collectionSchedules.collected}::numeric),0)` })
      .from(s.collectionSchedules).where(and(eq(s.collectionSchedules.businessId, b), eq(s.collectionSchedules.weekStart, weekMonday(today)))),
  ]);
  const cashInHand = r2(accounts.filter((a) => a.type === "cash").reduce((x, a) => x + n0(a.balance), 0));
  const bankBalance = r2(accounts.filter((a) => a.type === "bank").reduce((x, a) => x + n0(a.balance), 0));

  // overdue schedules (single query)
  const overdue = await db.select({
    scheduleId: s.collectionSchedules.id, weekStart: s.collectionSchedules.weekStart, dueDate: s.collectionSchedules.dueDate,
    expected: s.collectionSchedules.expected, collected: s.collectionSchedules.collected,
    customerId: s.customers.id, name: s.customers.name, balance: s.customers.balance, phone: s.customers.phone,
    area: s.customers.area, salesman: s.salesmen.name, lastSale: sql`(SELECT MAX(${s.sales.date}) FROM ${s.sales} WHERE ${s.sales.customerId} = ${s.customers.id} AND ${s.sales.status}='final')`,
  }).from(s.collectionSchedules)
    .innerJoin(s.customers, eq(s.customers.id, s.collectionSchedules.customerId))
    .leftJoin(s.salesmen, eq(s.salesmen.id, s.customers.salesmanId))
    .where(and(eq(s.collectionSchedules.businessId, b), lte(s.collectionSchedules.dueDate, today), sql`${s.collectionSchedules.collected}::numeric < ${s.collectionSchedules.expected}::numeric`))
    .orderBy(asc(s.collectionSchedules.dueDate)).limit(25);

  return {
    today, stats, receivables: n0(recvAgg[0].total), payables: n0(payAgg[0].total), cashInHand, bankBalance,
    stockValue: n0(stockAgg.v), todayGp: n0(gpAgg[0].gp), monthRevenue: n0(monthAgg[0].total), monthGp: n0(monthGp[0].gp),
    monthExpenses: n0(monthExp[0].total), collectionsToday, overdueSchedules: overdue, weekAgg: weekAgg[0],
    overdueAmount: overdue.reduce((a, o) => a + r2(n0(o.expected) - n0(o.collected)), 0),
  };
}

export async function getAlerts(user) {
  const b = B(user);
  const today = todayStr();
  const alerts = [];
  const [overdue] = await db.select({ count: sql`COUNT(*)`, amount: sql`COALESCE(SUM((${s.collectionSchedules.expected}::numeric - ${s.collectionSchedules.collected}::numeric)),0)` })
    .from(s.collectionSchedules).where(and(eq(s.collectionSchedules.businessId, b), lte(s.collectionSchedules.dueDate, today), sql`${s.collectionSchedules.collected}::numeric < ${s.collectionSchedules.expected}::numeric`));
  if (n0(overdue.count) > 0) alerts.push({ type: "ograi_overdue", level: "danger", title: `${overdue.count} customers have overdue ograi`, body: `Rs ${n0(overdue.amount).toLocaleString()} overdue`, href: "/ograi" });
  const low = await db.select({ id: s.products.id, name: s.products.name, color: s.products.color }).from(s.products)
    .innerJoin(s.stock, eq(s.stock.productId, s.products.id))
    .where(and(eq(s.products.businessId, b), eq(s.products.active, true), sql`${s.stock.qty}::numeric <= ${s.products.reorderLevel}::numeric AND ${s.products.reorderLevel}::numeric > 0`))
    .limit(200);
  if (low.length) alerts.push({ type: "low_stock", level: "warn", title: `${low.length} fabric(s) at/below reorder level`, body: low.slice(0, 3).map((p) => p.name).join(", ") + (low.length > 3 ? "…" : ""), href: "/inventory" });
  const [chq] = await db.select({ count: sql`COUNT(*)` }).from(s.cheques).where(and(eq(s.cheques.businessId, b), inArray(s.cheques.status, ["pending", "deposited"])));
  if (n0(chq.count) > 0) alerts.push({ type: "cheques", level: "info", title: `${chq.count} cheques pending clearance`, body: "Review cheque register", href: "/cheques" });
  const [payable] = await db.select({ amount: sql`COALESCE(SUM(${s.purchases.balance}::numeric),0)` }).from(s.purchases).where(and(eq(s.purchases.businessId, b), eq(s.purchases.status, "final"), sql`${s.purchases.balance}::numeric > 0`));
  if (n0(payable.amount) > 0) alerts.push({ type: "payables", level: "info", title: `Rs ${n0(payable.amount).toLocaleString()} supplier payments outstanding`, body: "See payables report", href: "/reports?tab=payables" });
  const limitBreach = await db.select({ id: s.customers.id, name: s.customers.name }).from(s.customers)
    .where(and(eq(s.customers.businessId, b), sql`${s.customers.creditLimit}::numeric > 0 AND ${s.customers.balance}::numeric > ${s.customers.creditLimit}::numeric`)).limit(50);
  if (limitBreach.length) alerts.push({ type: "credit_limit", level: "danger", title: `${limitBreach.length} customers over credit limit`, body: limitBreach.slice(0, 3).map((c) => c.name).join(", "), href: "/reports?tab=receivables" });
  const saved = await db.select().from(s.notifications).where(eq(s.notifications.businessId, b)).orderBy(desc(s.notifications.createdAt)).limit(10);
  return { alerts, recent: saved };
}

// ================= REPORTS =================
export async function profitLoss(businessId, from, to) {
  const b = businessId;
  const [salesAgg] = await db.select({ gross: sql`COALESCE(SUM(${s.sales.total}::numeric),0)`, discount: sql`COALESCE(SUM(${s.sales.discount}::numeric),0)` })
    .from(s.sales).where(and(eq(s.sales.businessId, b), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")));
  const [retAgg] = await db.select({ total: sql`COALESCE(SUM(${s.salesReturns.total}::numeric),0)`, cost: sql`COALESCE(SUM(${s.salesReturnItems.qty}::numeric * ${s.salesReturnItems.costRate}::numeric),0)` })
    .from(s.salesReturns).leftJoin(s.salesReturnItems, eq(s.salesReturnItems.returnId, s.salesReturns.id))
    .where(and(eq(s.salesReturns.businessId, b), gte(s.salesReturns.date, from), lte(s.salesReturns.date, to)));
  const [itemAgg] = await db.select({ revenue: sql`COALESCE(SUM(${s.saleItems.total}::numeric),0)`, cogs: sql`COALESCE(SUM(${s.saleItems.qty}::numeric * ${s.saleItems.costRate}::numeric),0)` })
    .from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId))
    .where(and(eq(s.sales.businessId, b), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")));
  const expenses = await db.select({ name: s.expenseCategories.name, total: sql`SUM(${s.expenses.amount}::numeric)` })
    .from(s.expenses).innerJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
    .where(and(eq(s.expenses.businessId, b), gte(s.expenses.date, from), lte(s.expenses.date, to)))
    .groupBy(s.expenseCategories.name).orderBy(desc(sql`SUM(${s.expenses.amount}::numeric)`));
  const grossSales = n0(salesAgg.gross);
  const returns = n0(retAgg.total);
  const netSales = r2(grossSales - returns);
  const cogs = r2(n0(itemAgg.cogs) - n0(retAgg.cost));
  const grossProfit = r2(netSales - cogs);
  const totalExpenses = r2(expenses.reduce((a, e) => a + n0(e.total), 0));
  return { grossSales, returns, netSales, cogs, grossProfit, expenses: expenses.map((e) => ({ name: e.name, total: n0(e.total) })), totalExpenses, netProfit: r2(grossProfit - totalExpenses) };
}

export async function receivablesReport(businessId, opts = {}) {
  const rows = (await db.execute(sql`
    WITH lp AS (SELECT party_id cid, max(date) d FROM payments WHERE business_id=${businessId} AND party_type='customer' AND status='final' GROUP BY party_id),
         fs AS (SELECT customer_id cid, min(date) d FROM sales WHERE business_id=${businessId} AND status='final' GROUP BY customer_id),
         oa AS (SELECT customer_id cid, sum(expected::numeric - collected::numeric) od FROM collection_schedules
                WHERE business_id=${businessId} AND due_date <= current_date AND collected::numeric < expected::numeric GROUP BY customer_id)
    SELECT c.id, c.name, c.area, c.phone, c.balance::numeric balance, c.credit_limit::numeric credit_limit,
           c.weekly_ograi::numeric weekly_ograi, sm.name salesman,
           GREATEST(0, current_date - COALESCE(lp.d, fs.d)) age_days, COALESCE(oa.od,0) overdue_ograi
    FROM customers c
    LEFT JOIN salesmen sm ON sm.id = c.salesman_id
    LEFT JOIN lp ON lp.cid = c.id LEFT JOIN fs ON fs.cid = c.id LEFT JOIN oa ON oa.cid = c.id
    WHERE c.business_id=${businessId} AND c.balance::numeric > 0
    ORDER BY c.balance::numeric DESC`)).rows;
  const out = rows.map((r) => {
    const bal = Number(r.balance), age = Number(r.age_days);
    const buckets = { b30: 0, b60: 0, b90: 0, b120: 0, bPlus: 0 };
    if (age <= 30) buckets.b30 = bal; else if (age <= 60) buckets.b60 = bal; else if (age <= 90) buckets.b90 = bal;
    else if (age <= 120) buckets.b120 = bal; else buckets.bPlus = bal;
    return { id: r.id, name: r.name, area: r.area, phone: r.phone, balance: bal, creditLimit: Number(r.credit_limit),
      weeklyOgrai: Number(r.weekly_ograi), salesman: r.salesman, buckets, overdueOgrai: Number(r.overdue_ograi),
      available: r2(Number(r.credit_limit) - bal), ageDays: age };
  });
  return out.filter((r) => !opts.salesman || r.salesman === opts.salesman);
}

export async function payablesReport(businessId) {
  const rows = await db.select({
    id: s.suppliers.id, name: s.suppliers.name, city: s.suppliers.city, phone: s.suppliers.phone,
    balance: s.suppliers.balance, category: s.suppliers.category,
  }).from(s.suppliers).where(and(eq(s.suppliers.businessId, businessId), sql`${s.suppliers.balance}::numeric > 0`)).orderBy(desc(s.suppliers.balance));
  return rows.map((r) => ({ ...r, balance: n0(r.balance) }));
}

export async function topProducts(businessId, from, to, limit = 8) {
  return db.select({
    name: s.products.name, color: s.products.color, qty: sql`SUM(${s.saleItems.qty}::numeric)`,
    revenue: sql`SUM(${s.saleItems.total}::numeric)`,
    profit: sql`SUM(${s.saleItems.total}::numeric - (${s.saleItems.qty}::numeric * ${s.saleItems.costRate}::numeric))`,
  }).from(s.saleItems)
    .innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId))
    .innerJoin(s.products, eq(s.products.id, s.saleItems.productId))
    .where(and(eq(s.sales.businessId, businessId), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")))
    .groupBy(s.products.name, s.products.color).orderBy(desc(sql`SUM(${s.saleItems.total}::numeric)`)).limit(limit);
}

export async function topCustomers(businessId, from, to, limit = 8) {
  return db.select({
    name: s.customers.name, total: sql`SUM(${s.sales.total}::numeric)`, count: sql`COUNT(${s.sales.id})`,
  }).from(s.sales).innerJoin(s.customers, eq(s.customers.id, s.sales.customerId))
    .where(and(eq(s.sales.businessId, businessId), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")))
    .groupBy(s.customers.name).orderBy(desc(sql`SUM(${s.sales.total}::numeric)`)).limit(limit);
}

export async function salesmanPerformance(businessId, from, to) {
  const [sm, saleRows, colRows] = await Promise.all([
    db.select().from(s.salesmen).where(and(eq(s.salesmen.businessId, businessId), eq(s.salesmen.active, true))),
    db.execute(sql`SELECT salesman_id sid, COALESCE(sum(total::numeric),0) v FROM sales WHERE business_id=${businessId} AND status='final' AND date::date BETWEEN ${from} AND ${to} GROUP BY salesman_id`),
    db.execute(sql`SELECT salesman_id sid, COALESCE(sum(amount::numeric),0) v FROM payments WHERE business_id=${businessId} AND status='final' AND date::date BETWEEN ${from} AND ${to} GROUP BY salesman_id`),
  ]);
  const saleMap = Object.fromEntries(saleRows.rows.map((r) => [r.sid, Number(r.v)]));
  const colMap = Object.fromEntries(colRows.rows.map((r) => [r.sid, Number(r.v)]));
  return sm.map((m) => {
    const sales = saleMap[m.id] || 0, collections = colMap[m.id] || 0;
    const rate = n0(m.commissionRate);
    const commission = m.commissionType === "percent_sales" ? r2(sales * rate / 100) : m.commissionType === "percent_collection" ? r2(collections * rate / 100) : 0;
    return { ...m, sales, collections, commission, commissionRate: rate };
  });
}

export async function weeklyComparison(businessId, weekStart) {
  const prev = addDays(weekStart, -7);
  const [cur, prv] = await Promise.all([periodTotals(businessId, weekStart, addDays(weekStart, 6)), periodTotals(businessId, prev, addDays(prev, 6))]);
  return { cur, prv, weekStart, prevStart: prev };
}

async function periodTotals(b, from, to) {
  const [salesAgg] = await db.select({ total: sql`COALESCE(SUM(${s.sales.total}::numeric),0)` }).from(s.sales).where(and(eq(s.sales.businessId, b), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")));
  const [purAgg] = await db.select({ total: sql`COALESCE(SUM(${s.purchases.total}::numeric),0)` }).from(s.purchases).where(and(eq(s.purchases.businessId, b), gte(s.purchases.date, from), lte(s.purchases.date, to), eq(s.purchases.status, "final")));
  const [colAgg] = await db.select({ total: sql`COALESCE(SUM(${s.payments.amount}::numeric),0)` }).from(s.payments).where(and(eq(s.payments.businessId, b), eq(s.payments.partyType, "customer"), gte(s.payments.date, from), lte(s.payments.date, to), eq(s.payments.status, "final")));
  const [expAgg] = await db.select({ total: sql`COALESCE(SUM(${s.expenses.amount}::numeric),0)` }).from(s.expenses).where(and(eq(s.expenses.businessId, b), gte(s.expenses.date, from), lte(s.expenses.date, to)));
  const [gpAgg] = await db.select({ gp: sql`COALESCE(SUM(${s.saleItems.total}::numeric - (${s.saleItems.qty}::numeric * ${s.saleItems.costRate}::numeric)),0)` })
    .from(s.saleItems).innerJoin(s.sales, eq(s.sales.id, s.saleItems.saleId))
    .where(and(eq(s.sales.businessId, b), gte(s.sales.date, from), lte(s.sales.date, to), eq(s.sales.status, "final")));
  const [newCust] = await db.select({ count: sql`COUNT(*)` }).from(s.customers).where(and(eq(s.customers.businessId, b), sql`${s.customers.createdAt}::date >= ${from} AND ${s.customers.createdAt}::date <= ${to}`));
  return { sales: n0(salesAgg.total), purchases: n0(purAgg.total), collections: n0(colAgg.total), expenses: n0(expAgg.total), grossProfit: n0(gpAgg.gp), newCustomers: Number(newCust.count) };
}

// ================= SEARCH =================
export async function globalSearch(user, q) {
  const b = B(user);
  const like = ilikePattern(q);
  const [custs, prods, invs, recs, sups] = await Promise.all([
    db.select({ id: s.customers.id, name: s.customers.name, sub: s.customers.phone }).from(s.customers)
      .where(and(eq(s.customers.businessId, b), or(ilike(s.customers.name, like), ilike(s.customers.phone, like), ilike(s.customers.code, like)))).limit(5),
    db.select({ id: s.products.id, name: s.products.name, sub: sql`${s.products.color} || ' • ' || ${s.products.sku}` }).from(s.products)
      .where(and(eq(s.products.businessId, b), or(ilike(s.products.name, like), ilike(s.products.sku, like), ilike(s.products.barcode, like), ilike(s.products.color, like)))).limit(5),
    db.select({ id: s.sales.id, name: s.sales.invoiceNo, sub: s.customers.name }).from(s.sales)
      .innerJoin(s.customers, eq(s.customers.id, s.sales.customerId))
      .where(and(eq(s.sales.businessId, b), ilike(s.sales.invoiceNo, like))).limit(5),
    db.select({ id: s.payments.id, name: s.payments.receiptNo, sub: s.payments.amount }).from(s.payments)
      .where(and(eq(s.payments.businessId, b), ilike(s.payments.receiptNo, like))).limit(5),
    db.select({ id: s.suppliers.id, name: s.suppliers.name, sub: s.suppliers.phone }).from(s.suppliers)
      .where(and(eq(s.suppliers.businessId, b), or(ilike(s.suppliers.name, like), ilike(s.suppliers.phone, like)))).limit(5),
  ]);
  return {
    customers: custs, products: prods, invoices: invs, receipts: recs, suppliers: sups,
  };
}
function ilikePattern(q) { return `%${String(q).replace(/[%_]/g, "")}%`; }
