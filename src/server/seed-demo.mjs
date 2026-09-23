/* Demo seed for Afridi Fabrics Wholesale. Run: npx tsx scripts/seed.mts */
import { randomBytes, scryptSync } from "node:crypto";
import { db } from "@/db";
import * as s from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import * as svc from "./services.mjs";
import { addDays, weekMonday } from "./util.mjs";

let seedState = 20260214;
function rnd() { seedState = (seedState * 1664525 + 1013904223) % 4294967296; return seedState / 4294967296; }
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

function todayStr() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()); }
function hash(pw) { const salt = randomBytes(12).toString("hex"); return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`; }

export async function seedDemoBusiness() {
  const existing = await db.select({ id: s.businesses.id }).from(s.businesses).limit(1);
  if (existing.length) { console.log("Database already seeded. Skipping."); return; }
  const today = todayStr();
  console.log("Seeding demo business (today =", today, ")…");

  const [biz] = await db.insert(s.businesses).values({
    name: "Afridi Fabrics Wholesale", phone: "091-5701234",
    address: "Shop 12-14, Cloth Market, Saddar, Peshawar", currency: "PKR", taxPct: "0",
    invoiceFooter: "Shukriya! Goods once sold are only returnable within 7 days with receipt.",
  }).returning({ id: s.businesses.id });
  const B = biz.id;

  await db.insert(s.users).values([
    { businessId: B, name: "Haji Karim Afridi", email: "owner@afridifabrics.pk", passwordHash: hash("afridi123"), role: "owner", phone: "0300-9001122" },
  ]);
  const ownerRows = await db.select().from(s.users).where(eq(s.users.email, "owner@afridifabrics.pk"));
  const owner = { id: ownerRows[0].id, businessId: B, role: "owner", name: ownerRows[0].name };

  const [br1] = await db.insert(s.branches).values({ businessId: B, name: "Saddar Main Branch", address: "Cloth Market, Saddar, Peshawar" }).returning({ id: s.branches.id });
  const [br2] = await db.insert(s.branches).values({ businessId: B, name: "Karkhano Branch", address: "Karkhano Market, Peshawar" }).returning({ id: s.branches.id });

  const whRows = await db.insert(s.warehouses).values([
    { businessId: B, branchId: br1.id, name: "Main Shop (Saddar)", isMain: true },
    { businessId: B, branchId: br1.id, name: "Godown — Namak Mandi" },
    { businessId: B, branchId: br2.id, name: "Karkhano Shop" },
    { businessId: B, branchId: br1.id, name: "Retail Shop", code: "RETAIL" },
  ]).returning({ id: s.warehouses.id });
  const [WH_MAIN, WH_GODOWN, WH_KARKHANO, WH_RETAIL] = whRows.map((w) => w.id);

  const smRows = await db.insert(s.salesmen).values([
    { businessId: B, name: "Muhammad Asad", phone: "0333-9112233", commissionType: "percent_collection", commissionRate: "1.5" },
    { businessId: B, name: "Bakht Zaman", phone: "0334-7861234", commissionType: "percent_collection", commissionRate: "1.0" },
    { businessId: B, name: "Faisal Khan", phone: "0331-2224455", commissionType: "percent_sales", commissionRate: "0.5" },
    { businessId: B, name: "Noor Wali", phone: "0335-6677889", commissionType: "percent_collection", commissionRate: "1.0" },
  ]).returning({ id: s.salesmen.id });
  const SM = smRows.map((x) => x.id);
  await db.insert(s.salesmanRoutes).values([
    { salesmanId: SM[0], dayOfWeek: 1, areas: "Saddar, Hashtnagri, Karkhano Market" },
    { salesmanId: SM[0], dayOfWeek: 2, areas: "Board Bazaar, Ring Road" },
    { salesmanId: SM[0], dayOfWeek: 3, areas: "Chowk Yadgar, Dabgari Garden" },
    { salesmanId: SM[0], dayOfWeek: 4, areas: "Namak Mandi, Kohat Road" },
    { salesmanId: SM[0], dayOfWeek: 5, areas: "Saddar, Karkhano Market" },
    { salesmanId: SM[1], dayOfWeek: 1, areas: "Warsak Road, Tehkal" },
    { salesmanId: SM[1], dayOfWeek: 2, areas: "University Road, Gulberg" },
    { salesmanId: SM[2], dayOfWeek: 1, areas: "Ring Road, Board Bazaar" },
    { salesmanId: SM[3], dayOfWeek: 4, areas: "Hashtnagri, Pishtakhwa" },
  ]);

  const catRows = await db.insert(s.expenseCategories).values([
    "Shop Rent", "Godown Rent", "Electricity", "Salaries", "Transport / Loading", "Fuel",
    "Internet & Phone", "Maintenance", "Packaging", "Chai / Food", "Stationery", "Miscellaneous",
  ].map((name) => ({ businessId: B, name }))).returning({ id: s.expenseCategories.id });
  const CAT = catRows.map((x) => x.id);

  const accRows = await db.insert(s.accounts).values([
    { businessId: B, type: "cash", name: "Main Shop Cash", openingBalance: "350000", balance: "350000" },
    { businessId: B, type: "cash", name: "Karkhano Cash", openingBalance: "80000", balance: "80000" },
    { businessId: B, type: "bank", name: "HBL Current — Saddar", bankName: "Habib Bank Ltd", accountNo: "0123-7900-112233", openingBalance: "1850000", balance: "1850000" },
    { businessId: B, type: "bank", name: "Meezan Bank — Ring Road", bankName: "Meezan Bank", accountNo: "0456-1122-998877", openingBalance: "620000", balance: "620000" },
  ]).returning({ id: s.accounts.id });
  const CASH_MAIN = accRows[0].id, CASH_KRK = accRows[1].id, BANK_HBL = accRows[2].id, BANK_MEEZAN = accRows[3].id;

  // pick an account that can cover an OUTFLOW; never overdraw — keeps every account reconcilable
  async function outflowAccount(prefer, amount) {
    const accs = await db.select().from(s.accounts).where(eq(s.accounts.businessId, B));
    const pref = accs.find((a) => a.id === prefer);
    if (pref && Number(pref.balance) > amount) return prefer;
    const ok = accs.filter((a) => Number(a.balance) > amount);
    if (ok.length) return ok[Math.floor(rnd() * ok.length)].id;
    return CASH_MAIN;
  }

  const fabrics = [
    ["Wash & Wear", 320, 385, 460], ["Cotton", 280, 335, 400], ["Lawn", 450, 525, 630],
    ["Khaddar", 380, 445, 525], ["Karandi", 520, 600, 710], ["Boski", 900, 1050, 1260],
    ["Malai Boski", 1100, 1290, 1520], ["Viscose", 350, 415, 495], ["Chiffon", 260, 315, 385],
    ["Velvet", 700, 825, 990], ["Latha", 240, 288, 345], ["Drill", 300, 355, 425],
    ["Polyester", 220, 262, 320], ["Kamkhwab", 850, 990, 1180], ["Slub", 330, 392, 470],
  ];
  const colors = ["Black", "White", "Off-White", "Navy", "Maroon", "Grey", "Beige", "Cream", "Olive", "Sky Blue", "Mustard", "Rust", "Charcoal", "Bottle Green", "Red"];
  const designs = ["Plain", "Self", "Embroidered", "Printed", "Jacquard"];
  const brands = ["Crescent", "Gul Ahmed", "Sapphire", "Nishat", "Al-Karam", "Local"];
  const widths = [44, 58, 60];

  const productRows = [];
  let skuN = 100;
  for (const [fabric, cost, whs, ret] of fabrics) {
    const nColors = fabric === "Wash & Wear" || fabric === "Cotton" || fabric === "Lawn" ? 12 : 7;
    for (let i = 0; i < nColors; i++) {
      const color = colors[(i * 3 + fabric.length) % colors.length];
      const design = designs[(i + fabric.length) % designs.length];
      const width = widths[(i + color.length) % widths.length];
      const f = 1 + (rnd() - 0.5) * 0.12;
      skuN += 1;
      productRows.push({
        businessId: B, sku: `AF-${skuN}`, barcode: `896${String(4000000 + skuN * 37)}`,
        name: fabric, fabricType: fabric, design, color, brand: pick(brands),
        collection: fabric === "Lawn" || fabric === "Chiffon" ? "Summer '26" : "Winter '25",
        season: fabric === "Lawn" || fabric === "Chiffon" || fabric === "Viscose" ? "Summer" : "Winter",
        quality: pick(["Premium", "Standard", "Export"]), widthIn: String(width), unit: "meter",
        costPrice: String(r2(cost * f)), wholesalePrice: String(r2(whs * f)), retailPrice: String(r2(ret * f)),
        vipPrice: String(r2(whs * f * 0.95)), reorderLevel: String(ri(80, 200)),
        gstRate: ["Polyester", "Latha", "Chiffon"].includes(fabric) ? "0" : "5",
      });
    }
  }
  const insertedProducts = await db.insert(s.products).values(productRows).returning({
    id: s.products.id, wholesalePrice: s.products.wholesalePrice, retailPrice: s.products.retailPrice,
    vipPrice: s.products.vipPrice, costPrice: s.products.costPrice, name: s.products.name,
    unit: s.products.unit,
  });
  console.log(`  ${insertedProducts.length} products`);

  let opCount = 0;
  for (const p of insertedProducts) {
    const meters = ri(500, 2400);
    await svc.adjustStock(owner, { productId: p.id, warehouseId: rnd() < 0.6 ? WH_MAIN : WH_GODOWN, qtyDelta: meters, reason: "Opening stock", type: "opening" });
    opCount++;
    if (rnd() < 0.5) await svc.adjustStock(owner, { productId: p.id, warehouseId: WH_KARKHANO, qtyDelta: ri(150, 600), reason: "Opening stock", type: "opening" });
  }
  console.log(`  opening stock for ${opCount} products`);

  // manual retail-only products (separate source, stock in Retail Shop)
  const retailItems = [
    ["Stitched Suit — Gul Ahmed", "Gul Ahmed", 3, 4500, 6000],
    ["Ladies Khaddar Suit — Nishat", "Nishat", 2, 3800, 5200],
    ["Kids Cotton Kurta", "Local", 5, 1200, 1800],
  ];
  for (const [nm, br, qty, buy, sell] of retailItems) {
    const [pr] = await db.insert(s.products).values({
      businessId: B, sku: `RT-${ri(1000, 9999)}`, name: nm, fabricType: "Retail", design: "Stitched",
      brand: br, unit: "piece", source: "retail", productType: "Retail",
      costPrice: String(buy), wholesalePrice: String(sell), retailPrice: String(sell), vipPrice: String(sell),
    }).returning({ id: s.products.id });
    await db.insert(s.stock).values({ businessId: B, productId: pr.id, warehouseId: WH_RETAIL, qty: String(qty), avgCost: String(buy) });
    await db.insert(s.stockMovements).values({ businessId: B, productId: pr.id, warehouseId: WH_RETAIL, type: "opening", qty: String(qty), prevQty: "0", newQty: String(qty), refType: "product_create", userId: owner.id, reason: "Opening stock" });
  }
  console.log("  manual retail products seeded (Retail Shop)");

  const supplierNames = ["Crescent Textile Mills", "Gul Ahmed Textile", "Sapphire Textile Mills", "Nishat Mills", "Al-Karam Textiles", "Kohinoor Textile Mills", "Hamza Textile", "Areej Textile Mills", "Sitara Textile", "Master Textile Mills", "Pioneer Textile", "Lucky Textile Mills", "Cherat Packaging", "Bannu Cloth Traders", "Karachi Fabric House", "Faisalabad Wholesale Co"];
  const supplierIds = [];
  for (let i = 0; i < supplierNames.length; i++) {
    const opening = i < 6 ? ri(150, 900) * 1000 : 0;
    const [row] = await db.insert(s.suppliers).values({
      businessId: B, code: `SUP-${String(i + 1).padStart(3, "0")}`, name: supplierNames[i],
      contactPerson: pick(["Malik Sahib", "Haji Rahman", "Seth Akram", "Chaudhry Imran", "Mian Tariq"]),
      phone: `03${ri(0, 5)}${ri(10, 99)}-${ri(1000000, 9999999)}`,
      city: pick(["Karachi", "Faisalabad", "Lahore", "Multan", "Peshawar"]),
      category: i < 12 ? "mill" : "wholesaler",
      openingBalance: String(opening), balance: String(opening), paymentTerms: pick(["monthly", "biweekly", "weekly"]),
    }).returning({ id: s.suppliers.id });
    supplierIds.push(row.id);
  }

  const areas = ["Saddar", "Hashtnagri", "Karkhano Market", "Board Bazaar", "Ring Road", "Chowk Yadgar", "Dabgari Garden", "Namak Mandi", "Kohat Road", "Warsak Road", "Tehkal", "University Road", "Gulberg", "Pishtakhwa", "Sarozai"];
  const nameA = ["Ahmad", "Khan", "Rehman", "Malik", "Yousafzai", "Afridi", "Khattak", "Hashmi", "Iqbal", "Karim", "Gul", "Sher", "Bacha", "Nawaz", "Faisal", "Zubair", "Tariq", "Sajjad", "Rahim", "Akbar", "Dost", "Wali", "Sardar", "Imran", "Junaid"];
  const nameB = ["Traders", "Cloth House", "Fabrics", "Cloth Store", "Textiles", "Garments", "Collection", "Kapra House", "Wholesale", "Mart", "Clothing", "Store"];
  const customerIds = [];
  const usedNames = new Set();
  for (let i = 0; i < 55; i++) {
    let nm = `${pick(nameA)} ${pick(nameB)}`;
    while (usedNames.has(nm)) nm = `${pick(nameA)} ${pick(nameB)}`;
    usedNames.add(nm);
    const cat = i < 8 ? "vip" : i < 34 ? "wholesale" : i < 48 ? "regular" : "cash";
    const weekly = cat === "cash" ? 0 : (rnd() < 0.25 ? ri(15, 80) * 1000 : 0); // 0 → auto 10% rule
    const opening = cat === "cash" ? 0 : ri(0, 420) * 1000;
    const [row] = await db.insert(s.customers).values({
      businessId: B, code: `CUST-${String(i + 1).padStart(3, "0")}`, name: nm,
      ownerName: `${pick(["Haji", "Malik", "Seth", "Mian", "Khan"])} ${pick(nameA)} ${pick(["Khan", "Sahib", "Jan", "Gul"])}`,
      phone: `03${ri(0, 5)}${ri(10, 99)}-${ri(1000000, 9999999)}`, whatsapp: null,
      address: pick(["Near Clock Tower", "Main Bazaar", "Shop # " + ri(1, 90) + ", Cloth Market", "Opposite Jamia Masjid", "Gali # " + ri(1, 20)]),
      city: "Peshawar", area: pick(areas), cnic: rnd() < 0.4 ? `173${ri(10, 99)}-${ri(1000000, 9999999)}-${ri(1, 9)}` : null,
      category: cat, priceLevel: cat === "vip" ? "vip" : cat === "cash" ? "retail" : "wholesale",
      discountPct: cat === "vip" ? "3" : "0", creditLimit: String(weekly > 0 ? weekly * ri(8, 12) : ri(150, 500) * 1000),
      paymentTerms: cat === "cash" ? "cash" : "weekly", weeklyOgrai: String(weekly),
      salesmanId: pick(SM), openingBalance: String(opening), balance: String(opening), status: "active",
    }).returning({ id: s.customers.id });
    customerIds.push(row.id);
  }
  console.log(`  ${customerIds.length} customers, ${supplierIds.length} suppliers`);

  // walk-in retail counter customer (individual suits, paid in full)
  const [walk] = await db.insert(s.customers).values({
    businessId: B, code: "WALKIN", name: "Walk-in Customer (Retail)", ownerName: null,
    phone: null, address: "Counter sale", city: "Peshawar", area: "Saddar",
    category: "retail", priceLevel: "retail", discountPct: "0", creditLimit: "0",
    paymentTerms: "cash", weeklyOgrai: "0", salesmanId: null,
    openingBalance: "0", balance: "0", status: "active",
  }).returning({ id: s.customers.id });
  customerIds.push(walk.id);

  for (let i = 0; i < 100; i++) {
    const date = addDays(today, -ri(2, 100));
    const lines = [];
    const nItems = ri(1, 4);
    for (let j = 0; j < nItems; j++) {
      const p = pick(insertedProducts);
      lines.push({ productId: p.id, qty: ri(100, 600), rate: r2(Number(p.costPrice) * (1 + (rnd() - 0.5) * 0.08)) });
    }
    const subtotal = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    const paidRatio = rnd() < 0.35 ? 1 : rnd() < 0.5 ? 0 : pick([0.25, 0.5, 0.7]);
    const paidAmt = r2(subtotal * paidRatio);
    try {
      await svc.createPurchase(owner, {
        supplierId: pick(supplierIds), warehouseId: rnd() < 0.6 ? WH_GODOWN : WH_MAIN, date,
        refNo: `MI/${ri(10000, 99999)}`, lines,
        paid: paidAmt, method: paidRatio > 0 ? (rnd() < 0.5 ? "bank_transfer" : "cheque") : "cash",
        accountId: await outflowAccount(rnd() < 0.5 ? BANK_HBL : BANK_MEEZAN, paidAmt),
        cheque: { bank: pick(["HBL", "UBL", "MCB", "Meezan"]), chequeNo: String(ri(100000, 999999)), expectedDate: addDays(date, ri(7, 21)) },
      });
    } catch (e) { console.log("  purchase skipped:", e.message); }
  }
  console.log("  purchases done");

  const custById = new Map(await db.select({ id: s.customers.id, priceLevel: s.customers.priceLevel, weeklyOgrai: s.customers.weeklyOgrai, category: s.customers.category }).from(s.customers).then((r) => r.map((x) => [x.id, x])));
  const makeLines = (cust, maxQty) => {
    const lines = [];
    const nItems = ri(1, 3);
    for (let j = 0; j < nItems; j++) {
      const p = pick(insertedProducts);
      const qty = ri(10, maxQty);
      const base = cust.priceLevel === "vip" ? Number(p.vipPrice) : cust.priceLevel === "retail" ? Number(p.retailPrice) : Number(p.wholesalePrice);
      lines.push({ productId: p.id, qty, rate: r2(base * (1 + (rnd() - 0.5) * 0.06)) });
    }
    return lines;
  };
  let salesMade = 0, salesSkipped = 0;
  for (let d = 119; d >= 0; d--) {
    const date = addDays(today, -d);
    const nInv = d === 0 ? ri(2, 4) : ri(3, 6);
    for (let i = 0; i < nInv; i++) {
      const customerId = pick(customerIds.filter((x) => x !== walk.id));
      const cust = custById.get(customerId);
      let lines = makeLines(cust, 90);
      const subtotal = () => lines.reduce((a, l) => a + l.qty * l.rate, 0);
      const retailKind = ["retail", "cash"].includes(cust.category);
      const isCash = retailKind || (cust.priceLevel === "retail" && rnd() < 0.7);
      const paidRatio = retailKind ? 1 : isCash ? 1 : rnd() < 0.25 ? pick([0.2, 0.3, 0.5]) : 0;
      const attempt = async (warehouseId) => svc.createSale(owner, {
        customerId, warehouseId, date,
        salesmanId: pick(SM), lines, discount: rnd() < 0.15 ? r2(subtotal() * 0.02) : 0,
        paid: r2(subtotal() * paidRatio), method: rnd() < 0.8 ? "cash" : pick(["bank_transfer", "easypaisa", "jazzcash"]),
        accountId: rnd() < 0.8 ? CASH_MAIN : CASH_KRK, taxPct: 0,
        saleKind: retailKind ? "retail" : "wholesale",
      });
      try {
        await attempt(rnd() < 0.75 ? WH_MAIN : WH_KARKHANO);
        salesMade++;
      } catch (e) {
        try { lines = makeLines(cust, 40); await attempt(WH_MAIN); salesMade++; }
        catch { salesSkipped++; }
      }
    }
    // weekly ograi collection wave keeps credit balances within limits
    if (d % 7 === 3 && d > 0) {
      const owing = await db.select({ id: s.customers.id, balance: s.customers.balance, weeklyOgrai: s.customers.weeklyOgrai, salesmanId: s.customers.salesmanId })
        .from(s.customers).where(sql`${s.customers.balance}::numeric > 50000`);
      for (const c of owing) {
        const weekRule = Number(c.weeklyOgrai) > 0 ? Number(c.weeklyOgrai) : Math.round(Number(c.balance) * 0.1);
        const amt = r2(Math.min(Number(c.balance) * 0.35, weekRule * (0.5 + rnd() * 0.6)));
        if (amt < 5000) continue;
        try {
          await svc.recordPayment(owner, {
            partyType: "customer", partyId: c.id, date, amount: amt, method: rnd() < 0.85 ? "cash" : "bank_transfer",
            accountId: rnd() < 0.85 ? CASH_MAIN : BANK_HBL, salesmanId: c.salesmanId, notes: "Weekly ograi",
          });
        } catch { }
      }
    }
  }
  // individual suit sales at the counter (retail)
  for (let i = 0; i < 60; i++) {
    const date = addDays(today, -ri(0, 119));
    const lines = [];
    const n = ri(1, 2);
    for (let j = 0; j < n; j++) {
      const p = pick(insertedProducts);
      lines.push({ productId: p.id, qty: ri(2, 6), rate: r2(Number(p.retailPrice) * (1 + (rnd() - 0.5) * 0.04)) });
    }
    const sub = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    try {
      await svc.createSale(owner, {
        customerId: walk.id, warehouseId: WH_MAIN, date, lines,
        paid: r2(sub), method: pick(["cash", "cash", "cash", "easypaisa", "jazzcash"]),
        accountId: CASH_MAIN, saleKind: "retail",
      });
      salesMade++;
    } catch (e) { salesSkipped++; }
  }
  console.log(`  sales: ${salesMade} made, ${salesSkipped} skipped`);

  const creditCustomers = await db.select().from(s.customers).where(sql`${s.customers.balance}::numeric > 0 AND ${s.customers.paymentTerms} != 'cash'`);
  const thisMonday = weekMonday(today);
  for (const c of creditCustomers) {
    for (let w = 4; w >= 1; w--) {
      const ws = addDays(thisMonday, -7 * w);
      const due = addDays(ws, 6);
      if (due >= today) continue;
      const expected = Number(c.weeklyOgrai) > 0 ? Number(c.weeklyOgrai) : Math.round(Number(c.balance) * 0.1); // 10% general rule
      if (expected <= 0) continue;
      const collFactor = pick([0, 0.4, 0.6, 0.8, 1, 1, 1.2]);
      const collected = r2(Math.min(expected * collFactor, Number(c.balance) * 0.25));
      await db.insert(s.collectionSchedules).values({
        businessId: B, customerId: c.id, weekStart: ws, dueDate: due, expected: String(expected), collected: String(collected),
      }).onConflictDoNothing();
      if (collected > 0) {
        try {
          await svc.recordPayment(owner, {
            partyType: "customer", partyId: c.id, date: due,
            amount: collected, method: rnd() < 0.85 ? "cash" : pick(["bank_transfer", "easypaisa"]),
            accountId: rnd() < 0.85 ? CASH_MAIN : BANK_HBL, salesmanId: c.salesmanId, notes: "Weekly ograi",
          });
        } catch (e) { }
      }
    }
  }
  const created = await svc.generateSchedules(owner, 1);
  console.log(`  schedules filled; current week ${created} created`);

  const todaysSchedules = await db.select({ id: s.collectionSchedules.id, customerId: s.collectionSchedules.customerId, expected: s.collectionSchedules.expected })
    .from(s.collectionSchedules).where(eq(s.collectionSchedules.weekStart, thisMonday)).limit(4);
  for (let i = 0; i < todaysSchedules.length; i++) {
    const sch = todaysSchedules[i];
    const amt = r2(Number(sch.expected) * pick([0.4, 0.6, 1]));
    try {
      await svc.recordPayment(owner, {
        partyType: "customer", partyId: sch.customerId, date: today, amount: amt, method: "cash",
        accountId: CASH_MAIN, salesmanId: SM[i % SM.length], scheduleId: sch.id, notes: "Ograi collected on route",
      });
    } catch (e) { }
  }

  const owingSuppliers = await db.select({ id: s.suppliers.id, balance: s.suppliers.balance }).from(s.suppliers).where(sql`${s.suppliers.balance}::numeric > 100000`);
  for (const sp of owingSuppliers) {
    const amt = r2(Number(sp.balance) * pick([0.15, 0.25, 0.4]));
    try {
      await svc.recordPayment(owner, {
        partyType: "supplier", partyId: sp.id, date: addDays(today, -ri(1, 40)), amount: amt,
        method: rnd() < 0.6 ? "cheque" : "bank_transfer", accountId: await outflowAccount(rnd() < 0.5 ? BANK_HBL : BANK_MEEZAN, amt),
        cheque: { bank: pick(["HBL", "Meezan", "UBL"]), chequeNo: String(ri(200000, 999999)), expectedDate: addDays(today, ri(2, 15)) },
        notes: "Supplier payment",
      });
    } catch (e) { }
  }

  for (let d = 90; d >= 0; d--) {
    const date = addDays(today, -d);
    const n = ri(1, 3);
    for (let i = 0; i < n; i++) {
      const catIdx = pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const amount = catIdx === 3 ? ri(25, 60) * 1000 : catIdx === 0 || catIdx === 1 ? ri(30, 80) * 1000 : ri(3, 120) * 100;
      try {
        await svc.addExpense(owner, {
          date, categoryId: CAT[catIdx], amount, accountId: rnd() < 0.8 ? CASH_MAIN : BANK_HBL,
          description: pick(["Shop expense", "Weekly expense", "Godown expense", "Market expense", "Daily expense"]),
        });
      } catch (e) { }
    }
  }
  console.log("  expenses done");

  const recentSales = await db.select({ id: s.sales.id, customerId: s.sales.customerId }).from(s.sales).where(eq(s.sales.status, "final")).orderBy(sql`${s.sales.id} DESC`).limit(30);
  for (let i = 0; i < 3 && i < recentSales.length; i++) {
    const sale = recentSales[i * 5];
    const items = await db.select().from(s.saleItems).where(eq(s.saleItems.saleId, sale.id)).limit(1);
    if (!items.length) continue;
    try {
      await svc.createSalesReturn(owner, {
        customerId: sale.customerId, saleId: sale.id, warehouseId: WH_MAIN, date: addDays(today, -ri(0, 6)),
        lines: [{ productId: items[0].productId, qty: r2(Number(items[0].qty) * 0.25), rate: Number(items[0].rate) }],
        reason: pick(["Color shade issue", "Wrong fabric supplied", "Quality complaint"]),
      });
    } catch (e) { }
  }

  await db.insert(s.employees).values([
    { businessId: B, name: "Shahid Iqbal", phone: "0301-5552211", role: "Accountant", salary: "45000", joiningDate: addDays(today, -700) },
    { businessId: B, name: "Muhammad Asad", phone: "0333-9112233", role: "Salesman", salary: "35000", joiningDate: addDays(today, -400) },
    { businessId: B, name: "Bakht Zaman", phone: "0334-7861234", role: "Salesman", salary: "32000", joiningDate: addDays(today, -300) },
    { businessId: B, name: "Gul Zada", phone: "0336-1112233", role: "Warehouse", salary: "28000", joiningDate: addDays(today, -200) },
    { businessId: B, name: "Faisal Khan", phone: "0331-2224455", role: "Salesman", salary: "33000", joiningDate: addDays(today, -150) },
  ]);

  const vipCust = await db.select({ id: s.customers.id }).from(s.customers).where(eq(s.customers.category, "vip")).limit(3);
  for (const c of vipCust) {
    for (const p of insertedProducts.slice(0, 10)) {
      await db.insert(s.customerPrices).values({ businessId: B, customerId: c.id, productId: p.id, price: String(r2(Number(p.wholesalePrice) * 0.96)) }).onConflictDoNothing();
    }
  }

  // NOTE: balances are never adjusted outside real transactions — every rupee of
  // every account must reconcile with opening + receipts − payments − expenses.

  console.log(`
=====================================================================
 DEMO BUSINESS SEEDED — Afridi Fabrics Wholesale
---------------------------------------------------------------------
 NOTE: This is DEMO DATA, separate from real business data.
 Login credentials (demo):
   Owner      owner@afridifabrics.pk      afridi123
=====================================================================`);
}

export async function ensureSeed() {
  const existing = await db.select({ id: s.businesses.id }).from(s.businesses).limit(1);
  if (existing.length) return { seeded: false };
  await seedDemoBusiness();
  return { seeded: true };
}
