"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Field, ErrorNote, Badge, Modal, toast } from "@/components/ui";
import { money, num, qtyFmt } from "@/lib/format";
import { useT } from "@/lib/useT";

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

export default function BillingClient({
  customers,
  products,
  stockRows,
  warehouses,
  salesmen,
  accounts,
  customerPrices,
  defaultWarehouseId,
  canOverride,
  initialCustomerId,
  initialProductId,
  retailWarehouseId,
}) {
  const router = useRouter();
  const t = useT();

  // Wholesale and Retail keep INDEPENDENT customer selections at the state level
  const [whCustomerId, setWhCustomerId] = useState(
    initialCustomerId ? String(initialCustomerId) : ""
  );
  const [rtCustomerId, setRtCustomerId] = useState("");

  const [custQ, setCustQ] = useState("");
  const [custOpen, setCustOpen] = useState(false);

  const [warehouseId, setWarehouseId] = useState(
    String(defaultWarehouseId)
  );

  const [salesmanId, setSalesmanId] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState([]);

  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);

  // Controls whether the product inventory dropdown is visible.
  // It stays closed on initial page load.
  const [searchOpen, setSearchOpen] = useState(false);

  const [discount, setDiscount] = useState("");
  const [gstMode, setGstMode] = useState("none");

  const [saleKind, setSaleKind] = useState("wholesale");
  const [retailSource, setRetailSource] = useState("inventory");

  const walkin = customers.find((c) => c.code === "WALKIN") || null;

  const customerId =
    saleKind === "wholesale" ? whCustomerId : rtCustomerId;

  const setCustomerId =
    saleKind === "wholesale"
      ? setWhCustomerId
      : setRtCustomerId;

  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");

  const [accountId, setAccountId] = useState(
    String(
      accounts.find((a) => a.type === "cash")?.id ||
        accounts[0]?.id ||
        ""
    )
  );

  const [overrideCredit, setOverrideCredit] = useState(false);
  const [overridePrice, setOverridePrice] = useState(false);
  const [allowNegative, setAllowNegative] = useState(false);

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);

  const [manualOpen, setManualOpen] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    try {
      setRecent(
        JSON.parse(
          localStorage.getItem("faberp_recent") || "[]"
        )
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Prefill a product when arriving from the product details page
  useEffect(() => {
    if (initialProductId) {
      const p = products.find((x) => x.id === initialProductId);

      if (p) {
        addProduct(p);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);

  const customer = customers.find(
    (c) => String(c.id) === customerId
  );

  const stockMap = useMemo(() => {
    const m = {};

    for (const r of stockRows) {
      m[`${r.productId}:${r.warehouseId}`] =
        Number(r.qty);
    }

    return m;
  }, [stockRows]);

  const priceMap = useMemo(() => {
    const m = {};

    for (const cp of customerPrices) {
      m[`${cp.customerId}:${cp.productId}`] =
        Number(cp.price);
    }

    return m;
  }, [customerPrices]);

  const rateFor = (p, cust) => {
    if (saleKind === "retail") {
      return (
        Number(p.retailPrice) ||
        Number(p.wholesalePrice)
      );
    }

    if (
      cust &&
      priceMap[`${cust.id}:${p.id}`]
    ) {
      return priceMap[`${cust.id}:${p.id}`];
    }

    const lvl = cust?.priceLevel || "wholesale";

    if (lvl === "vip") {
      return (
        Number(p.vipPrice) ||
        Number(p.wholesalePrice)
      );
    }

    if (lvl === "retail") {
      return Number(p.retailPrice);
    }

    return Number(p.wholesalePrice);
  };

  const pool = useMemo(() => {
    if (
      saleKind === "retail" &&
      retailSource === "manual"
    ) {
      return products.filter(
        (p) =>
          (p.source || "wholesale") === "retail" &&
          p.active !== false
      );
    }

    return products.filter(
      (p) =>
        (p.source || "wholesale") !== "retail" &&
        p.active !== false &&
        p.notForSale !== true
    );
  }, [products, saleKind, retailSource]);

  const stockOf = (p) =>
    stockMap[`${p.id}:${warehouseId}`] || 0;

  /*
   * PRODUCT SEARCH
   *
   * Empty search:
   *   Show inventory only when searchOpen === true.
   *
   * One or more characters:
   *   Immediately filter inventory by:
   *   - name
   *   - SKU
   *   - barcode
   *   - color
   *   - brand
   */
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();

    const inStock = pool.filter(
      (p) =>
        (stockMap[`${p.id}:${warehouseId}`] || 0) > 0
    );

    // Nothing typed:
    // return the available inventory for browsing.
    if (!t) {
      return [...inStock]
        .sort(
          (a, b) =>
            stockOf(b) - stockOf(a) ||
            a.name.localeCompare(b.name)
        )
        .slice(0, 12);
    }

    // User typed something:
    // filter immediately from the first character.
    return inStock
      .filter(
        (p) =>
          p.name
            .toLowerCase()
            .includes(t) ||
          p.sku
            .toLowerCase()
            .includes(t) ||
          (p.barcode || "")
            .toLowerCase()
            .includes(t) ||
          (p.color || "")
            .toLowerCase()
            .includes(t) ||
          (p.brand || "")
            .toLowerCase()
            .includes(t)
      )
      .slice(0, 12);
  }, [
    q,
    pool,
    stockMap,
    warehouseId,
  ]);

  const custMatches = useMemo(() => {
    if (!custQ.trim()) {
      return customers.slice(0, 0);
    }

    const q = custQ.toLowerCase();

    // Walk-in counter customer belongs to
    // Retail/Individual mode only.
    const pool =
      saleKind === "wholesale"
        ? customers.filter(
            (c) => c.code !== "WALKIN"
          )
        : customers;

    return pool
      .filter(
        (c) =>
          c.name
            .toLowerCase()
            .includes(q) ||
          (c.phone || "").includes(q) ||
          c.code
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 8);
  }, [
    custQ,
    customers,
    saleKind,
  ]);

  function addProduct(p) {
    const rate = rateFor(p, customer);

    // Product-level sale discount auto-applies
    // to every bill line.
    const autoDisc =
      Number(p.saleDiscountPct) > 0
        ? r2(
            (rate *
              Number(p.saleDiscountPct)) /
              100
          )
        : 0;

    setLines((ls) => {
      const i = ls.findIndex(
        (l) => l.productId === p.id
      );

      if (i >= 0) {
        const c = [...ls];

        c[i] = {
          ...c[i],
          qty: c[i].qty + 1,
        };

        return c;
      }

      return [
        ...ls,
        {
          productId: p.id,
          name: p.name,
          color: p.color,
          sku: p.sku,
          unit: p.unit,
          qty: 1,
          rate,
          discount: autoDisc,
          minPrice: Number(p.minPrice || 0),
        },
      ];
    });

    setRecent((r) => {
      const nr = [
        p.id,
        ...r.filter((x) => x !== p.id),
      ].slice(0, 8);

      try {
        localStorage.setItem(
          "faberp_recent",
          JSON.stringify(nr)
        );
      } catch {
        /* ignore */
      }

      return nr;
    });

    // Clear search after adding.
    setQ("");
    setHi(0);

    // Close dropdown after adding.
    setSearchOpen(false);

    // Keep the cursor in the search box so the
    // user can quickly add another product.
    searchRef.current?.focus();
  }

  function onSearchKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();

      setHi((h) =>
        Math.min(
          h + 1,
          matches.length - 1
        )
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();

      setHi((h) =>
        Math.max(h - 1, 0)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();

      // Barcode gets exact priority.
      const exact = products.find(
        (p) =>
          p.barcode &&
          p.barcode === q.trim()
      );

      if (exact) {
        return addProduct(exact);
      }

      // Otherwise add highlighted result.
      if (matches[hi]) {
        addProduct(matches[hi]);
      }
    } else if (e.key === "Escape") {
      setQ("");
      setSearchOpen(false);
    }
  }

  const lineTotal = (l) =>
    r2(
      l.qty * l.rate -
        (l.discount || 0)
    );

  const subtotal = r2(
    lines.reduce(
      (a, l) => a + lineTotal(l),
      0
    )
  );

  const disc = Math.min(
    Number(discount) || 0,
    subtotal
  );

  const gstTotal =
    gstMode === "none"
      ? 0
      : r2(
          lines.reduce(
            (a, l) => {
              const p = products.find(
                (x) =>
                  x.id === l.productId
              );

              return (
                a +
                (lineTotal(l) *
                  (Number(
                    p?.gstRate
                  ) || 0)) /
                  100
              );
            },
            0
          )
        );

  const total = r2(
    subtotal -
      disc +
      gstTotal
  );

  const isWalkinSale =
    customer?.code === "WALKIN";

  // Walk-in never carries a balance.
  const paidNum = isWalkinSale
    ? total
    : Math.min(
        Number(paid) || 0,
        total
      );

  const remaining = r2(
    total - paidNum
  );

  const prevBalance =
    Number(customer?.balance || 0);

  const projected = r2(
    prevBalance + remaining
  );

  const limit =
    Number(customer?.creditLimit || 0);

  const limitExceeded =
    limit > 0 &&
    projected > limit;

  async function save(print) {
    setErr("");

    if (!customerId) {
      return setErr(
        "Select a customer first — use the customer box (or press F2 style search)."
      );
    }

    if (!lines.length) {
      return setErr(
        "Add at least one fabric line."
      );
    }

    setBusy(true);

    try {
      const res = await fetch(
        "/api/sales",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            customerId:
              Number(customerId),

            warehouseId:
              Number(warehouseId),

            salesmanId: salesmanId
              ? Number(salesmanId)
              : null,

            date:
              date || undefined,

            lines: lines.map((l) => ({
              productId:
                l.productId,
              qty: l.qty,
              rate: l.rate,
              discount:
                l.discount || 0,
            })),

            discount: disc,
            paid: paidNum,
            method,
            accountId:
              Number(accountId),
            notes,
            saleKind,
            overrideCredit,
            overridePrice,
            allowNegative,
            gstMode,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      toast(
        `Invoice ${data.invoiceNo} saved — ${money(
          data.total
        )}`
      );

      if (print) {
        router.push(
          `/sales/${data.id}`
        );
        return;
      }

      setLines([]);
      setPaid("");
      setDiscount("");
      setNotes("");
      setOverrideCredit(false);
      setBusy(false);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid xl:grid-cols-[1fr_310px] gap-4">
      <div className="space-y-3 min-w-0">

        {/* SALE KIND */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">

          <button
            type="button"
            onClick={() =>
              setSaleKind("wholesale")
            }
            className={`rounded-md px-3 py-1.5 text-sm font-bold border ${
              saleKind === "wholesale"
                ? "bg-brand text-white border-brand"
                : "bg-white border-line hover:border-brand"
            }`}
          >
            {t("Wholesale")}
          </button>

          <button
            type="button"
            onClick={() => {
              setSaleKind("retail");

              if (
                !rtCustomerId &&
                walkin
              ) {
                setRtCustomerId(
                  String(walkin.id)
                );
              }
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-bold border ${
              saleKind === "retail"
                ? "bg-accent text-white border-accent"
                : "bg-white border-line hover:border-accent"
            }`}
          >
            {t("Retail / Individual")}
          </button>

          {saleKind === "retail" &&
            !isWalkinSale && (
              <span className="text-xs text-mute">
                {t(
                  "Retail pricing applied"
                )}
              </span>
            )}

          {isWalkinSale && (
            <span className="text-xs text-mute">
              {t(
                "Walk-in retail sales must be paid in full — collect the full amount."
              )}
            </span>
          )}

          {saleKind === "retail" && (
            <span className="flex items-center gap-1.5 ml-2">

              <button
                type="button"
                onClick={() =>
                  setRetailSource(
                    "inventory"
                  )
                }
                className={`rounded-md px-2.5 py-1 text-xs font-bold border ${
                  retailSource ===
                  "inventory"
                    ? "bg-night text-white border-night"
                    : "bg-white border-line hover:border-night"
                }`}
              >
                {t(
                  "Sell from Wholesale Inventory"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRetailSource(
                    "manual"
                  );

                  setWarehouseId(
                    String(
                      retailWarehouseId ||
                        defaultWarehouseId
                    )
                  );

                  setManualOpen(true);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-bold border ${
                  retailSource ===
                  "manual"
                    ? "bg-night text-white border-night"
                    : "bg-white border-line hover:border-night"
                }`}
              >
                {t(
                  "Manual Retail Product"
                )}
              </button>

              {retailSource ===
                "manual" && (
                <button
                  type="button"
                  onClick={() =>
                    setManualOpen(true)
                  }
                  className="text-xs font-bold text-accent hover:underline"
                >
                  +{" "}
                  {t(
                    "Add another manual product"
                  )}
                </button>
              )}

            </span>
          )}
        </div>

        {/* MANUAL RETAIL STOCK */}
        {saleKind === "retail" &&
          retailSource === "manual" && (
            <div className="rounded-lg border border-line bg-card p-3">

              <div className="flex items-center justify-between">
                <h4 className="font-display font-bold text-sm">
                  {t(
                    "Retail Shop stock"
                  )}
                </h4>

                <span className="text-[0.66rem] text-mute">
                  {t(
                    "Separate shop stock — not part of wholesale inventory"
                  )}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">

                {products
                  .filter(
                    (p) =>
                      (p.source ||
                        "wholesale") ===
                      "retail"
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        addProduct(p)
                      }
                      className="rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:border-accent"
                      title={t(
                        "Add to bill"
                      )}
                    >
                      {p.name}
                      {p.brand
                        ? ` · ${p.brand}`
                        : ""}
                      {" · "}
                      <span className="tnum">
                        {qtyFmt(
                          Number(
                            p.qty || 0
                          )
                        )}
                      </span>{" "}
                      {t("pcs")}
                      {" · "}
                      <span className="tnum">
                        {money(
                          p.retailPrice
                        )}
                      </span>
                    </button>
                  ))}

                {products.filter(
                  (p) =>
                    (p.source ||
                      "wholesale") ===
                    "retail"
                ).length === 0 && (
                  <span className="text-xs text-mute">
                    {t(
                      "No manual retail stock yet — use the Manual Retail Product entry above."
                    )}
                  </span>
                )}

              </div>
            </div>
          )}

        {/* PARTY + CONTEXT */}
        <div className="rounded-lg border border-line bg-card p-3 grid md:grid-cols-[1.4fr_1fr_1fr_1fr] gap-3">

          {/* CUSTOMER */}
          <div className="relative">

            <label className="text-[0.66rem] font-bold uppercase tracking-wide text-mute">
              {t("Customer")}{" "}
              <span className="text-danger">
                *
              </span>
            </label>

            {customer ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-brand/40 bg-brand-soft px-2.5 py-1.5">

                <div>
                  <div className="font-bold text-sm">
                    {customer.name}
                  </div>

                  <div className="text-[0.66rem] text-mute tnum">
                    Balance{" "}
                    {money(
                      prevBalance
                    )}{" "}
                    ·{" "}
                    {customer.priceLevel}{" "}
                    rate
                    {limit
                      ? ` · limit ${money(
                          limit
                        )}`
                      : ""}
                  </div>
                </div>

                <button
                  className="text-xs font-bold text-brand hover:underline"
                  onClick={() => {
                    setCustomerId("");
                    setCustQ("");
                  }}
                >
                  change
                </button>

              </div>
            ) : (
              <>
                <input
                  className="inp mt-1"
                  placeholder="Search customer by name / phone…"
                  value={custQ}
                  onChange={(e) => {
                    setCustQ(
                      e.target.value
                    );
                    setCustOpen(true);
                  }}
                  onFocus={() =>
                    setCustOpen(true)
                  }
                  onBlur={() =>
                    setTimeout(
                      () =>
                        setCustOpen(false),
                      180
                    )
                  }
                  autoFocus
                />

                {custOpen &&
                  custMatches.length >
                    0 && (
                    <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-card shadow-xl max-h-64 overflow-y-auto">

                      {custMatches.map(
                        (c) => (
                          <button
                            key={c.id}
                            onMouseDown={() => {
                              setCustomerId(
                                String(
                                  c.id
                                )
                              );
                              setCustOpen(
                                false
                              );
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-brand-soft text-sm border-b border-line-soft"
                          >
                            <span className="font-semibold">
                              {c.name}
                            </span>

                            <span className="text-mute text-xs">
                              {" · "}
                              {c.area ||
                                c.code}
                              {" · bal "}
                              {money(
                                c.balance
                              )}
                            </span>
                          </button>
                        )
                      )}

                    </div>
                  )}

                <Link
                  href="/customers"
                  className="text-[0.66rem] text-mute hover:text-brand"
                >
                  + quick create in
                  Customers
                </Link>
              </>
            )}

          </div>

          {/* GODOWN */}
          <Field label={t("Godown")}>
            <select
              className="inp"
              value={
                saleKind ===
                  "retail" &&
                retailSource ===
                  "manual"
                  ? String(
                      retailWarehouseId ||
                        warehouseId
                    )
                  : warehouseId
              }
              disabled={
                saleKind ===
                  "retail" &&
                retailSource ===
                  "manual"
              }
              onChange={(e) =>
                setWarehouseId(
                  e.target.value
                )
              }
            >
              {warehouses.map((w) => (
                <option
                  key={w.id}
                  value={w.id}
                >
                  {w.name}
                  {w.code ===
                  "RETAIL"
                    ? " · retail"
                    : ""}
                </option>
              ))}
            </select>
          </Field>

          {/* SALESMAN */}
          <Field label={t("Salesman")}>
            <select
              className="inp"
              value={salesmanId}
              onChange={(e) =>
                setSalesmanId(
                  e.target.value
                )
              }
            >
              <option value="">
                — Counter sale —
              </option>

              {salesmen.map((sm) => (
                <option
                  key={sm.id}
                  value={sm.id}
                >
                  {sm.name}
                </option>
              ))}
            </select>
          </Field>

          {/* DATE */}
          <Field label={t("Date")}>
            <input
              type="date"
              className="inp"
              value={date}
              onChange={(e) =>
                setDate(
                  e.target.value
                )
              }
            />
          </Field>

        </div>

        {/* PRODUCT SEARCH */}
        <div className="rounded-lg border border-line bg-card p-3">

          <div className="relative">

            <input
              ref={searchRef}
              className="inp !py-2.5 !text-[0.95rem]"
              placeholder="Click to browse stock — or type name, color, SKU, barcode…  (Enter adds)"
              value={q}
              onFocus={() =>
                setSearchOpen(true)
              }
              onBlur={() =>
                setTimeout(
                  () =>
                    setSearchOpen(false),
                  180
                )
              }
              onChange={(e) => {
                setQ(
                  e.target.value
                );
                setHi(0);

                // Typing also opens
                // the dropdown.
                setSearchOpen(true);
              }}
              onKeyDown={onSearchKey}
            />

            {searchOpen &&
              matches.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-card shadow-xl max-h-80 overflow-y-auto">

                  {matches.map(
                    (p, i) => {
                      const stk =
                        stockMap[
                          `${p.id}:${warehouseId}`
                        ] || 0;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseEnter={() =>
                            setHi(i)
                          }
                          onMouseDown={() =>
                            addProduct(p)
                          }
                          className={`w-full text-left px-3 py-2 text-sm border-b border-line-soft flex justify-between gap-2 ${
                            i === hi
                              ? "bg-brand-soft"
                              : ""
                          }`}
                        >

                          <span>
                            <span className="font-semibold">
                              {p.name}
                            </span>

                            <span className="text-mute">
                              {" "}
                              {p.color}
                              {" · "}
                              {p.design}
                              {" · "}
                              {p.sku}
                            </span>
                          </span>

                          <span className="text-right shrink-0">

                            <span className="tnum font-bold">
                              {money(
                                rateFor(
                                  p,
                                  customer
                                )
                              )}
                            </span>

                            {Number(
                              p.gstRate
                            ) > 0 && (
                              <span className="ml-1 text-[0.62rem] font-bold text-accent">
                                GST{" "}
                                {p.gstRate}
                                %
                              </span>
                            )}

                            <span
                              className={`block text-[0.66rem] ${
                                stk <= 0
                                  ? "text-danger"
                                  : "text-mute"
                              } tnum`}
                            >
                              {qtyFmt(stk)}{" "}
                              {p.unit}{" "}
                              {t(
                                "in stock"
                              )}
                            </span>

                          </span>
                        </button>
                      );
                    }
                  )}

                </div>
              )}

          </div>

          {/* RECENT PRODUCTS */}
          {recent.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap items-center">

              <span className="text-[0.66rem] uppercase font-bold text-mute tracking-wide">
                Recent:
              </span>

              {recent.map((id) => {
                const p =
                  products.find(
                    (x) => x.id === id
                  );

                if (
                  !p ||
                  !pool.some(
                    (x) => x.id === id
                  )
                ) {
                  return null;
                }

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      addProduct(p)
                    }
                    className="text-[0.7rem] font-semibold rounded-full border border-line bg-white px-2 py-0.5 hover:border-brand"
                  >
                    {p.name}{" "}
                    {p.color}
                  </button>
                );
              })}

            </div>
          )}

        </div>

        {/* BILL LINES */}
        <div className="rounded-lg border border-line bg-card overflow-x-auto">

          <table className="tbl">

            <thead>
              <tr>
                <th>#</th>
                <th>Fabric</th>
                <th className="num">
                  Qty
                </th>
                <th>Unit</th>
                <th className="num">
                  Rate
                </th>
                <th className="num">
                  Disc
                </th>
                <th className="num">
                  Total
                </th>
                <th></th>
              </tr>
            </thead>

            <tbody>

              {lines.length === 0 && (
                <tr>
                  <td
                    colSpan="8"
                    className="text-center text-mute py-10"
                  >
                    No items yet —
                    search a fabric
                    above or scan a
                    barcode.
                    <br />

                    <span className="text-xs">
                      Rates load
                      automatically
                      from the
                      customer's
                      price level.
                    </span>
                  </td>
                </tr>
              )}

              {lines.map((l, i) => {
                const stk =
                  stockMap[
                    `${l.productId}:${warehouseId}`
                  ] || 0;

                const short =
                  l.qty > stk;

                return (
                  <tr
                    key={l.productId}
                  >

                    <td className="text-mute">
                      {i + 1}
                    </td>

                    <td>
                      <div className="font-semibold">
                        {l.name}
                        {l.color
                          ? ` · ${l.color}`
                          : ""}
                      </div>

                      <div className="text-[0.66rem] text-mute">
                        {l.sku}

                        {short && (
                          <span className="text-danger font-bold">
                            {" · only "}
                            {qtyFmt(stk)}{" "}
                            {t(
                              "in stock"
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="num w-28">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        className="inp !py-1 text-right tnum"
                        value={l.qty}
                        onChange={(e) =>
                          setLines(
                            (ls) =>
                              ls.map(
                                (
                                  x,
                                  j
                                ) =>
                                  j ===
                                  i
                                    ? {
                                        ...x,
                                        qty: Number(
                                          e
                                            .target
                                            .value
                                        ),
                                      }
                                    : x
                              )
                          )
                        }
                      />
                    </td>

                    <td className="text-mute text-xs">
                      {l.unit}
                    </td>

                    <td className="num w-28">

                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="inp !py-1 text-right tnum"
                        value={l.rate}
                        onChange={(e) =>
                          setLines(
                            (ls) =>
                              ls.map(
                                (
                                  x,
                                  j
                                ) =>
                                  j ===
                                  i
                                    ? {
                                        ...x,
                                        rate: Number(
                                          e
                                            .target
                                            .value
                                        ),
                                      }
                                    : x
                              )
                          )
                        }
                      />

                      {l.minPrice >
                        0 &&
                        l.rate <
                          l.minPrice && (
                          <div className="text-[0.62rem] font-bold text-danger mt-0.5">
                            below min{" "}
                            {num(
                              l.minPrice
                            )}
                          </div>
                        )}

                    </td>

                    <td className="num w-24">

                      <input
                        type="number"
                        min="0"
                        className="inp !py-1 text-right tnum"
                        value={
                          l.discount ||
                          ""
                        }
                        placeholder="0"
                        onChange={(e) =>
                          setLines(
                            (ls) =>
                              ls.map(
                                (
                                  x,
                                  j
                                ) =>
                                  j ===
                                  i
                                    ? {
                                        ...x,
                                        discount:
                                          Number(
                                            e
                                              .target
                                              .value
                                          ),
                                      }
                                    : x
                              )
                          )
                        }
                      />

                    </td>

                    <td className="num tnum font-bold">
                      {money(
                        lineTotal(l)
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="text-mute hover:text-danger font-bold px-1"
                        onClick={() =>
                          setLines(
                            (ls) =>
                              ls.filter(
                                (
                                  _,
                                  j
                                ) =>
                                  j !== i
                              )
                          )
                        }
                      >
                        ✕
                      </button>
                    </td>

                  </tr>
                );
              })}

            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div className="space-y-3">

        <div className="rounded-lg border border-line bg-card p-4">

          <h3 className="font-display font-bold text-sm mb-2">
            {t("Bill Summary")}
          </h3>

          <div className="space-y-1.5 text-sm">

            <div className="flex justify-between">
              <span className="text-mute">
                {t("Subtotal")}
              </span>

              <span className="tnum font-semibold">
                {money(subtotal)}
              </span>
            </div>

            <div className="flex justify-between items-center gap-2">

              <span className="text-mute">
                {t("Discount")}
              </span>

              <input
                type="number"
                min="0"
                className="inp !w-28 !py-1 text-right tnum"
                value={discount}
                placeholder="0"
                onChange={(e) =>
                  setDiscount(
                    e.target.value
                  )
                }
              />

            </div>

            <div className="flex justify-between items-center gap-2">

              <span className="text-mute">
                {t("GST")}
              </span>

              <select
                className="inp !w-28 !py-1 text-xs"
                value={gstMode}
                onChange={(e) =>
                  setGstMode(
                    e.target.value
                  )
                }
              >
                <option value="none">
                  No GST
                </option>

                <option value="intra">
                  CGST+SGST
                </option>

                <option value="inter">
                  IGST
                </option>
              </select>

            </div>

            {gstMode !== "none" && (
              <div className="flex justify-between text-xs">

                <span className="text-mute">
                  {gstMode === "intra"
                    ? "CGST + SGST (per-item rates)"
                    : "IGST (per-item rates)"}
                </span>

                <span className="tnum">
                  {money(gstTotal)}
                </span>

              </div>
            )}

            <div className="flex justify-between border-t border-line pt-1.5 mt-1.5 text-base">

              <span className="font-bold">
                {t("Total")}
              </span>

              <span className="tnum font-bold">
                {money(total)}
              </span>

            </div>

          </div>

          {/* PAYMENT */}
          <div className="mt-3 pt-3 border-t border-line space-y-2">

            <div className="flex justify-between text-xs">

              <span className="text-mute">
                {t("Previous balance")}
              </span>

              <span className="tnum">
                {money(prevBalance)}
              </span>

            </div>

            <div className="flex justify-between items-center gap-2">

              <span className="text-sm font-bold">
                {t("Payment now")}
              </span>

              <div className="flex items-center gap-1">

                <input
                  type="number"
                  min="0"
                  className="inp !w-28 !py-1 text-right tnum"
                  value={
                    isWalkinSale
                      ? String(total)
                      : paid
                  }
                  placeholder="0"
                  disabled={
                    isWalkinSale
                  }
                  onChange={(e) =>
                    setPaid(
                      e.target.value
                    )
                  }
                />

                {!isWalkinSale && (
                  <button
                    type="button"
                    className="text-[0.66rem] font-bold rounded border border-line bg-white px-1.5 py-1 hover:border-brand"
                    onClick={() =>
                      setPaid(
                        String(total)
                      )
                    }
                  >
                    FULL
                  </button>
                )}

              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">

              <select
                className="inp text-xs"
                value={method}
                onChange={(e) =>
                  setMethod(
                    e.target.value
                  )
                }
              >
                {[
                  "cash",
                  "bank_transfer",
                  "cheque",
                  "online",
                  "easypaisa",
                  "jazzcash",
                ].map((m) => (
                  <option
                    key={m}
                    value={m}
                  >
                    {m.replace(
                      "_",
                      " "
                    )}
                  </option>
                ))}
              </select>

              <select
                className="inp text-xs"
                value={accountId}
                onChange={(e) =>
                  setAccountId(
                    e.target.value
                  )
                }
              >
                {accounts.map((a) => (
                  <option
                    key={a.id}
                    value={a.id}
                  >
                    {a.name}
                  </option>
                ))}
              </select>

            </div>

            <div className="flex justify-between text-sm border-t border-line pt-2">

              <span className="font-bold">
                {remaining > 0
                  ? t(
                      "Credit (udhaar)"
                    )
                  : t(
                      "Balance due"
                    )}
              </span>

              <span
                className={`tnum font-bold ${
                  remaining > 0
                    ? "text-danger"
                    : "text-ok"
                }`}
              >
                {money(remaining)}
              </span>

            </div>

            {remaining > 0 && (
              <div className="flex justify-between text-xs text-mute">

                <span>
                  Khata after this
                  bill
                </span>

                <span className="tnum">
                  {money(projected)}
                </span>

              </div>
            )}

          </div>

          {/* CREDIT LIMIT */}
          {limitExceeded && (
            <div className="mt-3 rounded-md bg-danger-soft border border-danger/25 px-3 py-2 text-xs">

              <div className="font-bold text-danger">
                Credit limit
                exceeded by{" "}
                {money(
                  r2(
                    projected -
                      limit
                  )
                )}
                .
              </div>

              {canOverride ? (
                <label className="flex items-center gap-1.5 mt-1.5 font-semibold">

                  <input
                    type="checkbox"
                    checked={
                      overrideCredit
                    }
                    onChange={(e) =>
                      setOverrideCredit(
                        e.target
                          .checked
                      )
                    }
                  />

                  Authorize override
                  (recorded in audit
                  log)
                </label>
              ) : (
                <div className="text-mute mt-1">
                  Only owner/manager
                  can override the
                  limit.
                </div>
              )}

            </div>
          )}

          {/* MINIMUM PRICE */}
          {lines.some(
            (l) =>
              l.minPrice > 0 &&
              l.rate < l.minPrice
          ) && (
            <div className="mt-3 rounded-md bg-danger-soft border border-danger/25 px-3 py-2 text-xs">

              <div className="font-bold text-danger">
                A rate is below the
                product's minimum
                sale price.
              </div>

              {canOverride ? (
                <label className="flex items-center gap-1.5 mt-1.5 font-semibold">

                  <input
                    type="checkbox"
                    checked={
                      overridePrice
                    }
                    onChange={(e) =>
                      setOverridePrice(
                        e.target
                          .checked
                      )
                    }
                  />

                  Authorize below-minimum
                  price (audited)
                </label>
              ) : (
                <div className="text-mute mt-1">
                  Only owner/manager
                  can sell below the
                  minimum price.
                </div>
              )}

            </div>
          )}

          {/* NEGATIVE STOCK */}
          {lines.some(
            (l) =>
              l.qty >
              (stockMap[
                `${l.productId}:${warehouseId}`
              ] || 0)
          ) && (
            <div className="mt-3 rounded-md bg-warn-soft border border-accent/25 px-3 py-2 text-xs">

              <div className="font-bold text-warn">
                Some lines exceed
                current stock in this
                godown.
              </div>

              {canOverride ? (
                <label className="flex items-center gap-1.5 mt-1.5 font-semibold">

                  <input
                    type="checkbox"
                    checked={
                      allowNegative
                    }
                    onChange={(e) =>
                      setAllowNegative(
                        e.target
                          .checked
                      )
                    }
                  />

                  Allow negative
                  stock (audited)
                </label>
              ) : (
                <div className="text-mute mt-1">
                  Reduce quantities
                  or move stock
                  between godowns
                  first.
                </div>
              )}

            </div>
          )}

          {/* SAVE BUTTONS */}
          <div className="mt-4 grid gap-2">

            <Button
              onClick={() =>
                save(true)
              }
              disabled={
                busy ||
                (limitExceeded &&
                  (!canOverride ||
                    !overrideCredit))
              }
              className="justify-center"
            >
              {busy
                ? t("Saving…")
                : `${t(
                    "Save & Print"
                  )} — ${money(total)}`}
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                save(false)
              }
              disabled={busy}
            >
              {t("Save & New Bill")}
            </Button>

          </div>

          <ErrorNote error={err} />

        </div>

        {/* MANUAL RETAIL MODAL */}
        <ManualRetailModal
          open={manualOpen}
          onClose={() =>
            setManualOpen(false)
          }
          onCreated={(line) =>
            setLines((ls) => [
              ...ls,
              line,
            ])
          }
          onRemove={(id) =>
            setLines((ls) =>
              ls.filter(
                (l) =>
                  l.productId !== id
              )
            )
          }
        />

        <div className="text-[0.68rem] text-mute leading-relaxed px-1">

          <div className="font-bold uppercase tracking-wide mb-1">
            Keyboard flow
          </div>

          Pick customer → type
          fabric →{" "}
          <kbd className="kbd">
            Enter
          </kbd>{" "}
          adds → tab through
          qty/rate →{" "}
          <kbd className="kbd">
            F
          </kbd>
          ull payment → Save &
          Print.

          Barcode scans add
          instantly.
        </div>

      </div>
    </div>
  );
}


/* =========================================================
   MANUAL RETAIL PRODUCT MODAL
   ========================================================= */

function ManualRetailModal({
  open,
  onClose,
  onCreated,
  onRemove,
}) {
  const t = useT();

  const empty = {
    name: "",
    brand: "",
    color: "",
    qtyBought: "",
    qtyBill: "1",
    buyPrice: "",
    sellPrice: "",
    notes: "",
  };

  const [f, setF] = useState(empty);
  const [added, setAdded] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const nameRef = useRef(null);

  const set = (k) => (e) =>
    setF({
      ...f,
      [k]: e.target.value,
    });

  const qb = Number(f.qtyBought);
  const qn = Number(
    f.qtyBill || 1
  );

  const valid =
    f.name.trim() &&
    qb > 0 &&
    qn >= 1 &&
    qn <= qb &&
    Number(f.buyPrice) > 0 &&
    Number(f.sellPrice) > 0;

  async function addEntry() {
    setBusy(true);
    setErr("");

    try {
      const res = await fetch(
        "/api/products",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: f.name.trim(),
            brand:
              f.brand || undefined,
            color:
              f.color || undefined,

            source: "retail",
            productType: "Retail",
            unit: "piece",

            costPrice:
              Number(
                f.buyPrice
              ),

            wholesalePrice:
              Number(
                f.sellPrice
              ),

            retailPrice:
              Number(
                f.sellPrice
              ),

            vipPrice:
              Number(
                f.sellPrice
              ),

            openingStock: qb,

            description:
              f.notes ||
              undefined,
          }),
        }
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error
        );
      }

      onCreated({
        productId: data.id,
        name: f.name.trim(),
        color: f.color || "",
        sku: data.sku || "",
        unit: "piece",
        qty: qn,
        rate: Number(
          f.sellPrice
        ),
        discount: 0,
        minPrice: 0,
        manual: true,
        stock: qb,
      });

      setAdded((a) => [
        ...a,
        {
          id: data.id,
          name: f.name.trim(),
          qty: qn,
          rate: Number(
            f.sellPrice
          ),
          buy: Number(
            f.buyPrice
          ),
        },
      ]);

      toast(
        `${f.name} — ${qn} × ${money(
          f.sellPrice
        )} ${t(
          "added to bill"
        )}`
      );

      setF(empty);

      setBusy(false);

      nameRef.current?.focus();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  function removeEntry(id) {
    onRemove(id);

    setAdded((a) =>
      a.filter(
        (x) => x.id !== id
      )
    );
  }

  const total = added.reduce(
    (a, x) =>
      a + x.qty * x.rate,
    0
  );

  const profit = added.reduce(
    (a, x) =>
      a +
      x.qty *
        (x.rate - x.buy),
    0
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(
        "Add Manual Retail Product"
      )}
      wide
    >

      <p className="text-xs text-mute mb-3">
        {t(
          "Add as many different suits/items as needed — each with its own quantity, bought price and sold price. Every entry becomes a separate bill line and separate Retail Shop stock."
        )}
      </p>

      <div className="grid sm:grid-cols-3 gap-3">

        <div className="sm:col-span-2">
          <Field
            label={t(
              "Product / Kapra Name"
            )}
            required
          >
            <input
              ref={nameRef}
              className="inp"
              value={f.name}
              onChange={set("name")}
              placeholder="e.g. Suit XYZ"
              autoFocus
            />
          </Field>
        </div>

        <Field label={t("Brand")}>
          <input
            className="inp"
            value={f.brand}
            onChange={set("brand")}
            placeholder="e.g. ABC"
          />
        </Field>

        <Field label={t("Color")}>
          <input
            className="inp"
            value={f.color}
            onChange={set("color")}
          />
        </Field>

        <Field
          label={t(
            "Quantity bought"
          )}
          required
          hint={t(
            "Stock created in Retail Shop"
          )}
        >
          <input
            type="number"
            min="1"
            className="inp tnum"
            value={f.qtyBought}
            onChange={set(
              "qtyBought"
            )}
            placeholder="2"
          />
        </Field>

        <Field
          label={t(
            "Qty on this bill"
          )}
          required
          hint={`1–${
            qb || "…"
          }`}
        >
          <input
            type="number"
            min="1"
            max={
              qb || undefined
            }
            className="inp tnum"
            value={f.qtyBill}
            onChange={set(
              "qtyBill"
            )}
          />
        </Field>

        <Field
          label={t(
            "Bought Price (PKR)"
          )}
          required
        >
          <input
            type="number"
            min="0"
            className="inp tnum"
            value={f.buyPrice}
            onChange={set(
              "buyPrice"
            )}
            placeholder="4500"
          />
        </Field>

        <Field
          label={t(
            "Sold Price (PKR)"
          )}
          required
        >
          <input
            type="number"
            min="0"
            className="inp tnum"
            value={f.sellPrice}
            onChange={set(
              "sellPrice"
            )}
            placeholder="6000"
          />
        </Field>

        <Field label={t("Notes")}>
          <input
            className="inp"
            value={f.notes}
            onChange={set("notes")}
          />
        </Field>

      </div>

      {f.name.trim() &&
        Number(f.buyPrice) >
          0 &&
        Number(f.sellPrice) >
          0 && (
          <div className="mt-3 rounded-md bg-ok-soft border border-ok/25 px-3 py-2 text-sm font-semibold text-ok tnum">
            {t("Gross profit")}:{" "}
            {money(
              (Number(
                f.sellPrice
              ) -
                Number(
                  f.buyPrice
                )) *
                (qn || 0)
            )}
          </div>
        )}

      {/* ITEMS ADDED TO THIS BILL */}
      {added.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-white">

          <div className="px-3 py-2 border-b border-line-soft flex items-center justify-between">

            <h4 className="font-display font-bold text-sm">
              {t(
                "Items on this bill"
              )}
            </h4>

            <span className="text-xs text-mute tnum">
              {t("Total")}:{" "}
              {money(total)}
              {" · "}
              {t("Gross profit")}:{" "}
              {money(profit)}
            </span>

          </div>

          <table className="tbl">

            <thead>
              <tr>
                <th>
                  {t("Product")}
                </th>

                <th className="num">
                  {t("Qty")}
                </th>

                <th className="num">
                  {t(
                    "Sold Price (PKR)"
                  )}
                </th>

                <th className="num">
                  {t("Total")}
                </th>

                <th></th>
              </tr>
            </thead>

            <tbody>

              {added.map((x) => (
                <tr key={x.id}>

                  <td className="font-semibold">
                    {x.name}
                  </td>

                  <td className="num tnum">
                    {x.qty}
                  </td>

                  <td className="num tnum">
                    {money(x.rate)}
                  </td>

                  <td className="num tnum font-bold">
                    {money(
                      x.qty *
                        x.rate
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="text-xs font-bold text-danger hover:underline"
                      onClick={() =>
                        removeEntry(
                          x.id
                        )
                      }
                    >
                      {t("Remove")}
                    </button>
                  </td>

                </tr>
              ))}

            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3">
        <ErrorNote error={err} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-4">

        <div className="text-xs text-mute">
          {t(
            "You can add several entries, then press Done."
          )}
        </div>

        <div className="flex gap-2">

          <Button
            variant="outline"
            onClick={onClose}
          >
            {added.length
              ? t("Done")
              : t("Cancel")}
          </Button>

          <Button
            onClick={addEntry}
            disabled={
              busy || !valid
            }
          >
            {busy
              ? t("Saving…")
              : t(
                  "Save & Add to Bill"
                )}
          </Button>

        </div>
      </div>

    </Modal>
  );
}