// Shared, client-safe catalog of business types for the multi-trade ERP.
// The app started as a Pakistani wholesale fabric ERP and is now generalised:
// every trade reuses the SAME generic engine (stock keyed off `unit`, journal,
// FIFO, khata). This module only drives LABELS, the allowed SELLING UNITS and
// any VERTICAL-SPECIFIC extra input fields. Extra fields are stored in the
// products.attributes JSONB column so new trades need no schema change.
//
// Labels here are plain English strings; callers wrap them with t() for i18n.

export const BUSINESS_TYPES = {
  fabric: {
    label: "Fabric & Textiles",
    namePh: "e.g. Wash & Wear Navy",
    group: "Fabric / Group", groupPh: "Select fabric / group",
    groups: ["Wash & Wear", "Cotton", "Lawn", "Khaddar", "Karandi", "Boski", "Viscose", "Chiffon", "Velvet", "Latha", "Drill", "Polyester", "Slub"],
    brand: "Brand / Mill", brandPh: "e.g. Crescent",
    color: true, design: true, width: true,
    unit: "meter", units: ["meter", "piece", "kg"],
    ptype: "Fabric",
    extraFields: [],
  },
  garments: {
    label: "Garments & Stitching",
    namePh: "e.g. Stitched Suit 3pc",
    group: "Line / Category", groupPh: "e.g. Suits, Shirts",
    groups: ["Suits", "Shirts", "Kurta", "Ladies Wear", "Kids Wear", "Abaya", "Coats"],
    brand: "Brand / Label", brandPh: "e.g. Outfitters",
    color: true, design: true, width: false,
    unit: "piece", units: ["piece", "set", "dozen"],
    ptype: "Stitching",
    extraFields: [
      { key: "size", label: "Size", type: "select", options: ["Free", "S", "M", "L", "XL", "XXL"] },
      { key: "stitching", label: "Stitching", type: "select", options: ["Unstitched", "Semi-Stitched", "Stitched"] },
    ],
  },
  general: {
    label: "General Store / Kiriana / Retail",
    namePh: "e.g. Basmati Rice 5kg",
    group: "Category", groupPh: "e.g. Grocery, Hardware",
    groups: ["Grocery", "Beverages", "Snacks", "Household", "Personal Care", "Cleaning", "Dairy", "Frozen"],
    brand: "Brand / Maker", brandPh: "e.g. National",
    color: false, design: false, width: false,
    unit: "piece", units: ["piece", "kg", "gram", "litre", "ml", "dozen", "pack", "box"],
    ptype: "General",
    extraFields: [
      { key: "packSize", label: "Pack Size", type: "text", ph: "e.g. 5 kg, 12-pack" },
      { key: "shelfLife", label: "Shelf Life", type: "text", ph: "e.g. 9 months" },
    ],
  },
  services: {
    label: "Services",
    namePh: "e.g. Suit Stitching",
    group: "Service Category", groupPh: "e.g. Stitching, Alteration",
    groups: ["Stitching", "Alteration", "Dyeing", "Delivery", "Installation", "Repair", "Consultation"],
    brand: "Provider", brandPh: "—",
    color: false, design: false, width: false,
    unit: "piece", units: ["piece", "hour", "visit", "day"],
    ptype: "Service",
    extraFields: [
      { key: "duration", label: "Typical Duration", type: "text", ph: "e.g. 30 min" },
    ],
  },
  pharmacy: {
    label: "Pharmacy / Medical Store",
    namePh: "e.g. Panadol 500mg",
    group: "Medicine Category", groupPh: "e.g. Tablets, Syrup",
    groups: ["Tablets", "Capsules", "Syrup", "Injection", "Sachet", "Drop", "Ointment", "Device", "Surgical"],
    brand: "Manufacturer", brandPh: "e.g. GSK",
    color: false, design: false, width: false,
    unit: "piece", units: ["piece", "box", "strip", "ml", "litre", "gm"],
    ptype: "General",
    extraFields: [
      { key: "batchNo", label: "Batch No.", type: "text", ph: "e.g. B-2041" },
      { key: "expiry", label: "Expiry Date", type: "date" },
      { key: "strength", label: "Strength / Dosage", type: "text", ph: "e.g. 500 mg" },
      { key: "prescription", label: "Requires Prescription", type: "select", options: ["No", "Yes"] },
    ],
  },
  electronics: {
    label: "Electronics / Mobile",
    namePh: "e.g. 32\" LED TV",
    group: "Category", groupPh: "e.g. TV, Phone, Accessory",
    groups: ["Mobile", "Laptop", "TV", "Audio", "Charger", "Cable", "Home Appliance", "Accessory"],
    brand: "Brand", brandPh: "e.g. Samsung",
    color: true, design: false, width: false,
    unit: "piece", units: ["piece", "set", "box"],
    ptype: "General",
    extraFields: [
      { key: "model", label: "Model", type: "text", ph: "e.g. Galaxy A15" },
      { key: "warranty", label: "Warranty (months)", type: "number", ph: "e.g. 12" },
      { key: "serialReq", label: "Serial / IMEI Tracked", type: "select", options: ["No", "Yes"] },
    ],
  },
  hardware: {
    label: "Hardware / Construction / Building",
    namePh: "e.g. Cement 50kg bag",
    group: "Category", groupPh: "e.g. Cement, Steel, Pipes",
    groups: ["Cement", "Steel / Saria", "Sand", "Basti", "Pipes", "Fittings", "Nails", "Paint", "Tools", "Electrical"],
    brand: "Brand / Mill", brandPh: "e.g. Maple Leaf",
    color: false, design: false, width: false,
    unit: "bag", units: ["bag", "kg", "ton", "feet", "inch", "piece", "roll"],
    ptype: "General",
    extraFields: [
      { key: "grade", label: "Grade / Size", type: "text", ph: "e.g. Grade 40, 12mm" },
      { key: "weight", label: "Unit Weight", type: "text", ph: "e.g. 50 kg" },
    ],
  },
  auto: {
    label: "Auto / Bike Parts & Accessories",
    namePh: "e.g. Brake Pad — Corolla",
    group: "Category", groupPh: "e.g. Engine, Body, Electrical",
    groups: ["Engine", "Brake", "Suspension", "Electrical", "Body", "Lubricant", "Tyre", "Accessory"],
    brand: "Brand", brandPh: "e.g. Toyota Genuine",
    color: false, design: false, width: false,
    unit: "piece", units: ["piece", "set", "pair", "box"],
    ptype: "General",
    extraFields: [
      { key: "fits", label: "Fits Models", type: "text", ph: "e.g. Corolla 2015-2020" },
      { key: "partNo", label: "Part Number", type: "text" },
    ],
  },
  furniture: {
    label: "Furniture & Woodwork",
    namePh: "e.g. 3-Seater Sofa",
    group: "Category", groupPh: "e.g. Sofa, Bed, Chair",
    groups: ["Sofa", "Bed", "Chair", "Table", "Cabinet", "Mattress", "Office"],
    brand: "Maker / Brand", brandPh: "e.g. Interwood",
    color: true, design: true, width: false,
    unit: "piece", units: ["piece", "set", "sqft"],
    ptype: "General",
    extraFields: [
      { key: "material", label: "Material", type: "text", ph: "e.g. Sheesham, MDF" },
      { key: "dimensions", label: "Dimensions (LxWxH in)", type: "text", ph: "e.g. 72x34x30" },
    ],
  },
  cosmetics: {
    label: "Cosmetics & Beauty",
    namePh: "e.g. Face Cream 50g",
    group: "Category", groupPh: "e.g. Skin, Hair, Makeup",
    groups: ["Skin Care", "Hair Care", "Makeup", "Fragrance", "Personal Care", "Salon"],
    brand: "Brand", brandPh: "e.g. Rivaj",
    color: true, design: false, width: false,
    unit: "piece", units: ["piece", "ml", "gm", "box"],
    ptype: "General",
    extraFields: [
      { key: "volume", label: "Volume / Weight", type: "text", ph: "e.g. 50 ml" },
      { key: "shelfLife", label: "Shelf Life", type: "text", ph: "e.g. 24 months" },
    ],
  },
  stationery: {
    label: "Stationery & Book Shop",
    namePh: "e.g. Notebook 200 pages",
    group: "Category", groupPh: "e.g. Paper, Pen, Books",
    groups: ["Notebooks", "Pens", "Paper", "Books", "Art & Craft", "Office", "Files"],
    brand: "Brand", brandPh: "e.g. Serac",
    color: true, design: false, width: false,
    unit: "piece", units: ["piece", "dozen", "pack", "box", "ream"],
    ptype: "General",
    extraFields: [
      { key: "grade", label: "Grade / Class", type: "text", ph: "e.g. Matric, 200 pg" },
    ],
  },
  food: {
    label: "Bakery / Restaurant / Food",
    namePh: "e.g. Chicken Biryani",
    group: "Menu Category", groupPh: "e.g. Main, Snack, Drink",
    groups: ["Main Dish", "Snack", "BBQ", "Bread / Bakery", "Dessert", "Drink", "Combo"],
    brand: "Brand / Kitchen", brandPh: "—",
    color: false, design: false, width: false,
    unit: "piece", units: ["piece", "plate", "kg", "gram", "litre", "ml"],
    ptype: "General",
    extraFields: [
      { key: "serving", label: "Serving / Weight", type: "text", ph: "e.g. 1 plate, 250 g" },
      { key: "perishable", label: "Perishable", type: "select", options: ["No", "Yes"] },
    ],
  },
  jewelry: {
    label: "Jewelry & Gold",
    namePh: "e.g. Gold Ring 22K",
    group: "Category", groupPh: "e.g. Ring, Necklace, Bangle",
    groups: ["Ring", "Necklace", "Bangle", "Earrings", "Chain", "Silver", "Watches"],
    brand: "Maker / Hallmark", brandPh: "—",
    color: false, design: true, width: false,
    unit: "gram", units: ["gram", "tola", "piece", "carat"],
    ptype: "General",
    extraFields: [
      { key: "metal", label: "Metal", type: "select", options: ["Gold", "Silver", "Platinum", "Alloy"] },
      { key: "carat", label: "Carat / Purity", type: "text", ph: "e.g. 22K, 925" },
      { key: "makingPct", label: "Making Charge %", type: "number", ph: "e.g. 8" },
    ],
  },
  agriculture: {
    label: "Agri / Veterinary / Garden",
    namePh: "e.g. Urea Fertilizer 50kg",
    group: "Category", groupPh: "e.g. Seed, Fertilizer, Medicine",
    groups: ["Fertilizer", "Seed", "Pesticide", "Animal Feed", "Vet Medicine", "Tools", "Plants"],
    brand: "Brand / Manufacturer", brandPh: "e.g. Engro",
    color: false, design: false, width: false,
    unit: "bag", units: ["bag", "kg", "litre", "ml", "piece"],
    ptype: "General",
    extraFields: [
      { key: "season", label: "Season / Crop", type: "text", ph: "e.g. Rabi, Wheat" },
      { key: "strength", label: "Strength / Concentration", type: "text", ph: "e.g. 46% N" },
    ],
  },
  tiles: {
    label: "Tiles / Marble / Paint / Sanitary",
    namePh: "e.g. Floor Tile 24x24",
    group: "Category", groupPh: "e.g. Floor, Wall, Paint",
    groups: ["Floor Tile", "Wall Tile", "Marble", "Granite", "Paint", "Primer", "Sanitary", "Tapware"],
    brand: "Brand / Mill", brandPh: "e.g. Master Tiles",
    color: true, design: true, width: false,
    unit: "sqft", units: ["sqft", "box", "piece", "litre", "gallon"],
    ptype: "General",
    extraFields: [
      { key: "size", label: "Size", type: "text", ph: "e.g. 24x24 in" },
      { key: "finish", label: "Finish", type: "select", options: ["Glossy", "Matte", "Anti-skid"] },
    ],
  },
};

export const BIZ_KEYS = Object.keys(BUSINESS_TYPES);

// Safe lookup — always returns a usable config (falls back to fabric).
export function getBiz(key) {
  return BUSINESS_TYPES[key] || BUSINESS_TYPES.fabric;
}
