import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { api } from "@/server/api.mjs";
import { getPartyLedger } from "@/server/services.mjs";
import { BizError } from "@/server/util.mjs";

const csv = (headers, rows) =>
  [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");

export const GET = api(async ({ user, req }) => {
  const p = new URL(req.url).searchParams;
  const type = p.get("type");
  const b = user.businessId;
  let file = "export.csv", content = "";

  if (type === "customers") {
    const rows = await db.select().from(s.customers).where(eq(s.customers.businessId, b)).orderBy(asc(s.customers.name));
    content = csv(["Code", "Name", "Owner", "Phone", "Area", "Category", "Terms", "Weekly Ograi", "Credit Limit", "Balance"],
      rows.map((r) => [r.code, r.name, r.ownerName, r.phone, r.area, r.category, r.paymentTerms, r.weeklyOgrai, r.creditLimit, r.balance]));
    file = "customers.csv";
  } else if (type === "products") {
    const rows = await db.select().from(s.products).where(eq(s.products.businessId, b));
    content = csv(["SKU", "Barcode", "Fabric", "Design", "Color", "Brand", "Width", "Unit", "Cost", "Wholesale", "Retail", "VIP"],
      rows.map((r) => [r.sku, r.barcode, r.name, r.design, r.color, r.brand, r.widthIn, r.unit, r.costPrice, r.wholesalePrice, r.retailPrice, r.vipPrice]));
    file = "products.csv";
  } else if (type === "ledger") {
    const kind = p.get("kind") || "customer";
    const id = Number(p.get("id"));
    const { party, rows } = await getPartyLedger(b, kind, id);
    content = csv(["Date", "Description", "Debit", "Credit", "Balance"],
      rows.map((r) => [r.date, r.desc, r.debit, r.credit, r.balance]));
    file = `${kind}-ledger-${party.code || id}.csv`;
  } else if (type === "sales") {
    const conds = [eq(s.sales.businessId, b)];
    if (p.get("from")) conds.push(gte(s.sales.date, p.get("from")));
    if (p.get("to")) conds.push(lte(s.sales.date, p.get("to")));
    const rows = await db.select({
      invoiceNo: s.sales.invoiceNo, date: s.sales.date, customer: s.customers.name, total: s.sales.total,
      paid: s.sales.paid, balance: s.sales.balance, status: s.sales.status,
    }).from(s.sales).innerJoin(s.customers, eq(s.customers.id, s.sales.customerId))
      .where(and(...conds)).orderBy(desc(s.sales.date)).limit(5000);
    content = csv(["Invoice", "Date", "Customer", "Total", "Paid", "Balance", "Status"],
      rows.map((r) => [r.invoiceNo, r.date, r.customer, r.total, r.paid, r.balance, r.status]));
    file = "sales.csv";
  } else if (type === "payments") {
    const rows = await db.select({
      receiptNo: s.payments.receiptNo, date: s.payments.date, partyType: s.payments.partyType,
      amount: s.payments.amount, method: s.payments.method, kind: s.payments.kind, notes: s.payments.notes,
    }).from(s.payments).where(eq(s.payments.businessId, b)).orderBy(desc(s.payments.date)).limit(5000);
    content = csv(["Receipt", "Date", "Party Type", "Amount", "Method", "Kind", "Notes"],
      rows.map((r) => [r.receiptNo, r.date, r.partyType, r.amount, r.method, r.kind === "sale" ? "sale-time" : "ograi/recovery", r.notes]));
    file = "payments.csv";
  } else if (type === "gst") {
    const conds = [eq(s.sales.businessId, b), eq(s.sales.status, "final"), sql`${s.sales.tax}::numeric > 0`];
    if (p.get("from")) conds.push(gte(s.sales.date, p.get("from")));
    if (p.get("to")) conds.push(lte(s.sales.date, p.get("to")));
    const rows = await db.select({
      invoiceNo: s.sales.invoiceNo, date: s.sales.date, gstMode: s.sales.gstMode,
      customer: s.customers.name,
      taxable: sql`(${s.sales.subtotal}::numeric - ${s.sales.discount}::numeric)`,
      tax: s.sales.tax, total: s.sales.total,
    }).from(s.sales).innerJoin(s.customers, eq(s.customers.id, s.sales.customerId))
      .where(and(...conds)).orderBy(s.sales.date).limit(10000);
    const half = (v) => (Math.round(Number(v) * 50) / 100).toFixed(2);
    content = csv(["Invoice", "Date", "Customer", "GST Type", "Taxable Value", "CGST", "SGST", "IGST", "Invoice Total"],
      rows.map((r) => [r.invoiceNo, r.date, r.customer, r.gstMode === "intra" ? "CGST+SGST" : r.gstMode === "inter" ? "IGST" : r.gstMode,
        Number(r.taxable).toFixed(2),
        r.gstMode === "intra" ? half(r.tax) : "0.00",
        r.gstMode === "intra" ? half(r.tax) : "0.00",
        r.gstMode === "inter" ? Number(r.tax).toFixed(2) : "0.00",
        Number(r.total).toFixed(2)]));
    file = `gst-data-${p.get("from") || "all"}-${p.get("to") || "today"}.csv`;
  } else if (type === "expenses") {
    const rows = await db.select({
      date: s.expenses.date, category: s.expenseCategories.name, amount: s.expenses.amount,
      account: s.accounts.name, description: s.expenses.description,
    }).from(s.expenses)
      .innerJoin(s.expenseCategories, eq(s.expenseCategories.id, s.expenses.categoryId))
      .innerJoin(s.accounts, eq(s.accounts.id, s.expenses.accountId))
      .where(eq(s.expenses.businessId, b)).orderBy(desc(s.expenses.date)).limit(5000);
    content = csv(["Date", "Category", "Amount", "Account", "Description"],
      rows.map((r) => [r.date, r.category, r.amount, r.account, r.description]));
    file = "expenses.csv";
  } else {
    throw new BizError("Unknown export type");
  }

  return new Response("\ufeff" + content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
    },
  });
});
