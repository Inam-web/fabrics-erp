// Central brand identity — every surface (sidebar, login, header, loading,
// invoices, print layouts, reports, settings) resolves the logo from here,
// so a single update (or an uploaded business logo) applies everywhere.
export const BRAND = {
  name: "AfridiTech",
  tagline: "Wholesale • Retail ERP",
  mark: "/brand/logo.svg",
  lockupLight: "/brand/lockup-light.svg", // light text — dark backgrounds
  lockupDark: "/brand/lockup-dark.svg", // dark text — light backgrounds / print
  colors: { emerald: "#0d6b57", forest: "#0a4f41", gold: "#e8c98a", ivory: "#f3f1e9" },
};

// A business may upload its own logo (settings); otherwise the brand mark is used.
export const brandMark = (business) => business?.logo || BRAND.mark;
