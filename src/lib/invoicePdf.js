// Client-side branded invoice PDF (text-based via pdfmake — crisp, selectable, no screenshot/color issues).
// pdfmake is dynamically imported at call time so it never runs during server render.
import { money, money2, qtyFmt, dateFmt } from "@/lib/format";

const C = {
  brand: "#0d6b57", brandDeep: "#0a4f41", ink: "#1f241c", mute: "#68705f",
  line: "#e3dfd2", soft: "#e2efe8", gold: "#b97a12", danger: "#b3402e", paper: "#f6f5ef",
};

let fontsReady = null;
async function getPdfMake() {
  const { default: pdfMake } = await import("pdfmake/build/pdfmake");
  if (!fontsReady) {
    const { default: vfs } = await import("pdfmake/build/vfs_fonts");
    pdfMake.vfs = vfs?.pdfMake?.vfs || vfs?.vfs || pdfMake.vfs;
    fontsReady = true;
  }
  return pdfMake;
}

const shortNo = (no) => String(no || "").replace(/^INV-\d+-/, "");

function label(txt) { return { text: txt, fontSize: 8, bold: true, color: C.mute, characterSpacing: 0.6 }; }

export function invoiceDocDefinition(d) {
  const kind = d.saleKind === "retail" ? "Retail Invoice" : "Invoice";
  const logoIsData = typeof d.business.logo === "string" && d.business.logo.startsWith("data:image");

  const bizLeft = {
    stack: [
      ...(logoIsData ? [{ image: d.business.logo, width: 92, margin: [0, 0, 0, 6] }] : []),
      { text: d.business.name, fontSize: 19, bold: true, color: C.brandDeep },
      ...(d.business.address ? [{ text: d.business.address, fontSize: 9, color: C.mute, margin: [0, 2, 0, 0] }] : []),
      ...(d.business.phone ? [{ text: "Contact: " + d.business.phone, fontSize: 9, color: C.mute, margin: [0, 1, 0, 0] }] : []),
    ],
  };
  const rightMeta = {
    stack: [
      { text: "(Original Copy)", alignment: "right", fontSize: 8, bold: true, color: C.mute },
      { text: kind.toUpperCase(), alignment: "right", fontSize: 11, bold: true, color: C.brand, characterSpacing: 1.2, margin: [0, 4, 0, 0] },
      { text: "#" + shortNo(d.invoiceNo), alignment: "right", fontSize: 22, bold: true, color: C.ink },
      { text: dateFmt(d.date), alignment: "right", fontSize: 9, color: C.mute, margin: [0, 2, 0, 0] },
    ],
  };

  const billTo = {
    stack: [
      label("BILL TO"),
      { text: d.customer.name, fontSize: 12, bold: true, margin: [0, 3, 0, 0] },
      ...(d.customer.contactPerson ? [{ text: d.customer.contactPerson, fontSize: 9, color: C.mute }] : []),
      { text: [d.customer.address, d.customer.area, d.customer.city].filter(Boolean).join(", ") || "—", fontSize: 9, color: C.mute, margin: [0, 1, 0, 0] },
      ...(d.customer.phone ? [{ text: "Phone: " + d.customer.phone, fontSize: 9, color: C.mute, margin: [0, 1, 0, 0] }] : []),
    ],
  };
  const details = {
    stack: [
      label("INVOICE DETAILS"),
      { text: [
        [
          [
            { text: "Due Date\n", fontSize: 8, color: C.mute }, { text: dateFmt(d.date) + "\n", fontSize: 9, bold: true, margin: [0, 0, 0, 4] },
            { text: "A/c Balance\n", fontSize: 8, color: C.mute }, { text: money(d.acBalance) + " Dr\n", fontSize: 9, bold: true, margin: [0, 0, 0, 4] },
          ],
          [
            { text: "Godown\n", fontSize: 8, color: C.mute }, { text: (d.warehouse || "—") + "\n", fontSize: 9, bold: true, margin: [0, 0, 0, 4] },
            { text: "Salesman\n", fontSize: 8, color: C.mute }, { text: (d.salesman || "Counter sale") + "\n", fontSize: 9, bold: true, margin: [0, 0, 0, 4] },
            { text: "Type\n", fontSize: 8, color: C.mute }, { text: (d.saleKind === "retail" ? "Retail" : "Wholesale") + "\n", fontSize: 9, bold: true },
          ],
        ],
      ] },
    ],
  };

  const itemsHeader = ["S#", "Description", "Qty", "Unit", "Unit Price", "Amount"].map((h, i) => ({
    text: h, bold: true, color: "#fff", fontSize: 8.5,
    alignment: i >= 2 && i !== 3 ? "right" : "left", characterSpacing: 0.5,
  }));
  const itemsBody = [itemsHeader, ...d.items.map((it, i) => [
    { text: String(i + 1), fontSize: 9, color: C.mute },
    { text: it.desc + (it.sub ? "\n" + it.sub : ""), fontSize: 9 },
    { text: qtyFmt(it.qty), alignment: "right", fontSize: 9 },
    { text: (it.unit || "").toUpperCase(), alignment: "left", fontSize: 8, color: C.mute },
    { text: money2(it.rate), alignment: "right", fontSize: 9 },
    { text: money(it.total), alignment: "right", fontSize: 9, bold: true },
  ])];

  const gstOn = d.gstMode && d.gstMode !== "none" && Number(d.tax) > 0;
  const totalRows = [
    [{ text: "Subtotal", fontSize: 9, color: C.mute }, { text: money(d.subtotal), fontSize: 9, alignment: "right" }],
  ];
  if (Number(d.discount) > 0) totalRows.push([{ text: "Discount", fontSize: 9, color: C.mute }, { text: "- " + money(d.discount), fontSize: 9, alignment: "right" }]);
  if (gstOn) {
    if (d.gstMode === "inter") totalRows.push([{ text: "IGST", fontSize: 9, color: C.mute }, { text: money(d.tax), fontSize: 9, alignment: "right" }]);
    else {
      totalRows.push([{ text: "CGST", fontSize: 9, color: C.mute }, { text: money(d.tax / 2), fontSize: 9, alignment: "right" }]);
      totalRows.push([{ text: "SGST", fontSize: 9, color: C.mute }, { text: money(d.tax / 2), fontSize: 9, alignment: "right" }]);
    }
  }
  if (Number(d.paid) > 0) totalRows.push([{ text: "Received", fontSize: 9, color: C.brand }, { text: money(d.paid), fontSize: 9, alignment: "right" }]);
  if (Number(d.balance) > 0) totalRows.push([{ text: "Balance Due", fontSize: 9, color: C.danger }, { text: money(d.balance), fontSize: 9, alignment: "right" }]);

  return {
    pageSize: "A4",
    pageMargins: [40, 46, 40, 52],
    defaultStyle: { font: "Roboto", fontSize: 10, color: C.ink },
    styles: {
      th: { fillColor: C.brand },
    },
    content: [
      { table: { widths: ["*", "auto"], body: [[bizLeft, rightMeta]] }, layout: "noBorders" },
      { canvas: [{ type: "line", x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 2, lineColor: C.brand }], margin: [0, 12, 0, 12] },
      {
        table: {
          widths: ["52%", "48%"],
          body: [[
            { stack: [billTo], margin: [10, 8, 10, 8], fillColor: C.soft },
            { stack: [details], margin: [10, 8, 10, 8], fillColor: C.paper },
          ]],
        },
        layout: "noBorders", margin: [0, 0, 0, 14],
      },
      {
        table: { headerRows: 1, widths: ["6%", "44%", "11%", "11%", "14%", "14%"], body: itemsBody },
        layout: {
          fillColor: (row) => (row === 0 ? C.brand : (row % 2 === 0 ? "#f6f8f6" : null)),
          hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: () => 0.5, vLineWidth: () => 0,
        },
      },
      {
        columns: [
          { width: "*", stack: [
            Number(d.balance) > 0
              ? { text: "BALANCE DUE", fontSize: 9, bold: true, color: C.gold, characterSpacing: 1 }
              : { text: "PAID IN FULL", fontSize: 9, bold: true, color: C.brand, characterSpacing: 1 },
            { text: "Terms / Declaration", fontSize: 9, bold: true, margin: [0, 10, 0, 2] },
            { text: d.footer || "Goods once sold are only returnable within 7 days with this invoice.", fontSize: 8, color: C.mute, lineGap: 1 },
          ] },
          { width: 210, stack: [
            { table: { widths: ["*", "auto"], body: totalRows.map((r) => [r[0], r[1]]) }, layout: "noBorders" },
            {
              table: { widths: ["*", "auto"], body: [[
                { text: "TOTAL AMOUNT", bold: true, color: "#fff", fontSize: 9, fillColor: C.gold, characterSpacing: 0.6 },
                { text: money(d.total), bold: true, color: "#fff", fontSize: 12, alignment: "right", fillColor: C.gold },
              ]] }, layout: "noBorders", margin: [0, 6, 0, 0],
            },
          ] },
        ],
        margin: [0, 16, 0, 0],
      },
      {
        columns: [
          { width: 170, stack: [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: C.ink }] }, { text: "Customer Signature", fontSize: 8, color: C.mute, margin: [0, 2, 0, 0] }] },
          { width: "*", stack: [] },
          { width: 170, stack: [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: 160, y2: 0, lineWidth: 0.8, lineColor: C.ink }] }, { text: "Authorized Signature", fontSize: 8, color: C.mute, alignment: "right", margin: [0, 2, 0, 0] }] },
        ],
        margin: [0, 40, 0, 0],
      },
    ],
    footer: (page, total) => ({
      columns: [
        { text: `${d.invoiceNo} · ${d.business.name}`, fontSize: 7.5, color: C.mute },
        { text: `Page ${page} of ${total}`, fontSize: 7.5, color: C.mute, alignment: "right" },
      ], margin: [40, 12, 40, 0],
    }),
  };
}

// Returns a PDF Blob for the given invoice payload.
export async function buildInvoicePdfBlob(d) {
  const pdfMake = await getPdfMake();
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(invoiceDocDefinition(d)).getBlob((b) => resolve(b)); }
    catch (e) { reject(e); }
  });
}
