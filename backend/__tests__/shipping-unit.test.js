const {
  roundUpKg,
  normalizeAddress,
  zoneMatches,
  selectZone,
  methodCoversAddress,
  isEmptyAddress,
  computeFee,
  computeTierFee,
  resolveShippingDiscount,
  quoteProfile,
  ShippingDomainError,
  MAX_FEE,
} = require("../services/ShippingService");

/**
 * Shipping pricing engine — unit tests (Phase 36, P1-08).
 *
 * All pure: no Mongo, no HTTP. This is where the buyer's price is decided, so
 * this is where it is tested hardest. The seller-facing HTTP surface and the
 * checkout integration live in shipping-profile.test.js / shipping-checkout.test.js.
 */

const TEHRAN = {
  receiverName: "علی",
  receiverPhone: "09120000001",
  province: "تهران",
  city: "تهران",
  postalCode: "1658953711",
  line1: "خیابان آزادی، کوچه بهار",
  lat: 35.7448,
  lng: 51.4033,
};

const method = (over = {}) => ({
  key: "post",
  title: "پست پیشتاز",
  kind: "delivery",
  enabled: true,
  carrier: "پست",
  pricing: { mode: "flat", flatFee: 45000, perKgFee: 0, perItemFee: 0, freeThreshold: 0 },
  eta: { minDays: 2, maxDays: 5 },
  zones: [],
  pickup: {},
  ...over,
});

const profile = (over = {}) => ({
  isEnabled: true,
  freeShippingThreshold: 0,
  methods: [method()],
  ...over,
});

describe("roundUpKg", () => {
  it("bills per started kilogram, like a courier does", () => {
    expect(roundUpKg(0.2)).toBe(1);
    expect(roundUpKg(1)).toBe(1);
    expect(roundUpKg(1.01)).toBe(2);
    expect(roundUpKg(2.4)).toBe(3);
  });

  it("never returns a negative or fractional kilo", () => {
    expect(roundUpKg(0)).toBe(0);
    expect(roundUpKg(-5)).toBe(0);
    expect(roundUpKg(NaN)).toBe(0);
    expect(roundUpKg(undefined)).toBe(0);
  });
});

describe("normalizeAddress", () => {
  it("accepts a complete Iranian address", () => {
    const result = normalizeAddress(TEHRAN);
    expect(result.ok).toBe(true);
    expect(result.value.province).toBe("تهران");
    expect(result.value.postalCode).toBe("1658953711");
  });

  it("normalizes Persian and Arabic postal digits", () => {
    for (const code of ["۱۶۵۸۹۵۳۷۱۱", "١٦٥٨٩٥٣٧١١", "16589 53711", "16589-53711"]) {
      const result = normalizeAddress({ ...TEHRAN, postalCode: code });
      expect(result.value.postalCode).toBe("1658953711");
    }
  });

  it("normalizes Arabic ی/ک to their Persian forms in the province", () => {
    const result = normalizeAddress({ ...TEHRAN, province: "كردستان" });
    expect(result.value.province).toBe("کردستان");
  });

  it("rejects an unknown province instead of storing a typo", () => {
    const result = normalizeAddress({ ...TEHRAN, province: "استانی که وجود ندارد" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("استان معتبر نیست");
  });

  it("requires a receiver name and phone", () => {
    const result = normalizeAddress({ ...TEHRAN, receiverName: "", receiverPhone: "" });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(["نام گیرنده الزامی است", "شماره تماس گیرنده الزامی است"]),
    );
  });

  it("requires a city and a street line once a province is given", () => {
    const result = normalizeAddress({ ...TEHRAN, city: "", line1: "" });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(["شهر الزامی است", "نشانی الزامی است"]),
    );
  });

  it("rejects a malformed postal code rather than truncating it", () => {
    const result = normalizeAddress({ ...TEHRAN, postalCode: "12345" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("کدپستی معتبر نیست");
  });

  it("rejects out-of-range and non-numeric coordinates", () => {
    for (const coords of [
      { lat: 999, lng: 51 },
      { lat: 35.7, lng: 999 },
      { lat: "north", lng: 51.4 },
    ]) {
      const result = normalizeAddress({ ...TEHRAN, ...coords });
      expect(result.ok).toBe(false);
      expect(result.errors.join(" ")).toContain("مختصات جغرافیایی معتبر نیست");
    }
  });

  it("accepts a far-eastern longitude, which a swapped argument order would reject", () => {
    // lng 120 / lat 35 is a valid pair. `isValidCoordinates(lng, lat)` takes the
    // longitude first, so passing (lat, lng) tests 120 against the +/-90
    // latitude bound and wrongly refuses a perfectly good address.
    const result = normalizeAddress({ ...TEHRAN, lat: 35, lng: 120 });
    expect(result.ok).toBe(true);
    expect(result.value.lng).toBe(120);
  });

  it("treats coordinates as optional", () => {
    const withoutCoords = { ...TEHRAN };
    delete withoutCoords.lat;
    delete withoutCoords.lng;
    expect(normalizeAddress(withoutCoords).ok).toBe(true);
  });

  it("trims and caps every free-text field", () => {
    const result = normalizeAddress({ ...TEHRAN, line1: "  " + "ا".repeat(500) + "  " });
    expect(result.value.line1.length).toBe(300);
  });
});

describe("zoneMatches", () => {
  it("matches an all-zone anywhere", () => {
    expect(zoneMatches({ type: "all", enabled: true }, {})).toBe(true);
  });

  it("matches a province zone by normalized name", () => {
    const zone = { type: "province", enabled: true, provinces: ["كردستان"] };
    expect(zoneMatches(zone, { province: "کردستان" })).toBe(true);
    expect(zoneMatches(zone, { province: "تهران" })).toBe(false);
  });

  it("does not match a province zone when the buyer gave no province", () => {
    const zone = { type: "province", enabled: true, provinces: ["تهران"] };
    expect(zoneMatches(zone, {})).toBe(false);
  });

  it("matches a postal zone by prefix, not by equality", () => {
    const zone = { type: "postal_code", enabled: true, postalPrefixes: ["16"] };
    expect(zoneMatches(zone, { postalCode: "1658953711" })).toBe(true);
    expect(zoneMatches(zone, { postalCode: "1234567890" })).toBe(false);
  });

  it("matches a radius zone by real distance, not by province", () => {
    const zone = {
      type: "radius",
      enabled: true,
      center: { lat: 35.6892, lng: 51.389 },
      radiusKm: 30,
    };
    // ~7 km away: inside.
    expect(zoneMatches(zone, { lat: 35.7448, lng: 51.4033 })).toBe(true);
    // Mashhad, ~750 km away: outside.
    expect(zoneMatches(zone, { lat: 36.2605, lng: 59.6168 })).toBe(false);
  });

  it("treats a radius zone as not matching when the buyer gave no coordinates", () => {
    const zone = {
      type: "radius",
      enabled: true,
      center: { lat: 35.6892, lng: 51.389 },
      radiusKm: 30,
    };
    expect(zoneMatches(zone, { province: "تهران" })).toBe(false);
  });

  it("never matches a disabled zone", () => {
    expect(zoneMatches({ type: "all", enabled: false }, TEHRAN)).toBe(false);
  });
});

describe("selectZone", () => {
  const multi = method({
    zones: [
      { label: "پیش‌فرض", type: "all", enabled: true },
      { label: "استان تهران", type: "province", enabled: true, provinces: ["تهران"] },
      { label: "غرب تهران", type: "postal_code", enabled: true, postalPrefixes: ["16"] },
      {
        label: "تا ۲۰ کیلومتر",
        type: "radius",
        enabled: true,
        center: { lat: 35.6892, lng: 51.389 },
        radiusKm: 20,
      },
    ],
  });

  it("prefers the most specific match, not the first declared", () => {
    // All four zones match a west-Tehran address inside 20 km. The radius zone
    // is the most specific, so it must win — otherwise the buyer's price
    // depends on array order, which no seller can reason about from the UI.
    expect(selectZone(multi, TEHRAN).label).toBe("تا ۲۰ کیلومتر");
  });

  it("falls back to a catch-all when a specific zone does not apply", () => {
    const far = {
      ...TEHRAN,
      province: "خراسان رضوی",
      city: "مشهد",
      postalCode: "9188765431",
      lat: 36.2605,
      lng: 59.6168,
    };
    const m = method({
      zones: [
        { label: "پیش‌فرض", type: "all", enabled: true },
        { label: "استان تهران", type: "province", enabled: true, provinces: ["تهران"] },
      ],
    });
    expect(selectZone(m, far).label).toBe("پیش‌فرض");
  });

  it("ignores a disabled zone even when it is the best match", () => {
    const m = method({
      zones: [
        { label: "پیش‌فرض", type: "all", enabled: true },
        { label: "غیرفعال", type: "postal_code", enabled: false, postalPrefixes: ["16"] },
      ],
    });
    expect(selectZone(m, TEHRAN).label).toBe("پیش‌فرض");
  });

  it("returns null when nothing matches", () => {
    const m = method({
      zones: [{ label: "مشهد", type: "province", enabled: true, provinces: ["خراسان رضوی"] }],
    });
    expect(selectZone(m, TEHRAN)).toBeNull();
  });
});

describe("methodCoversAddress", () => {
  it("offers a delivery method with no zones to any complete address", () => {
    expect(methodCoversAddress(method(), TEHRAN)).toBe(true);
    expect(methodCoversAddress(method(), {})).toBe(false);
  });

  it("hides a specific-zone method outside its coverage", () => {
    const m = method({
      zones: [{ label: "مشهد", type: "province", enabled: true, provinces: ["خراسان رضوی"] }],
    });
    expect(methodCoversAddress(m, TEHRAN)).toBe(false);
    expect(
      methodCoversAddress(m, { ...TEHRAN, province: "خراسان رضوی", city: "مشهد" }),
    ).toBe(true);
  });

  it("keeps offering a method that has a catch-all zone, at the base price", () => {
    const m = method({
      zones: [
        { label: "پیش‌فرض", type: "all", enabled: true },
        { label: "مشهد", type: "province", enabled: true, provinces: ["خراسان رضوی"] },
      ],
    });
    expect(methodCoversAddress(m, TEHRAN)).toBe(true);
  });

  it("offers pickup with no address, but hides a pickup method with no address", () => {
    const withAddress = method({ kind: "pickup", pickup: { address: "تهران، آزادی" } });
    const withoutAddress = method({ kind: "pickup", pickup: {} });
    expect(methodCoversAddress(withAddress, {})).toBe(true);
    expect(methodCoversAddress(withoutAddress, {})).toBe(false);
  });
});

describe("computeFee", () => {
  it("charges a flat fee", () => {
    expect(computeFee({ method: method(), subtotal: 100000 })).toBe(45000);
  });

  it("charges per started kilogram", () => {
    const m = method({ pricing: { mode: "weight", perKgFee: 30000 } });
    expect(computeFee({ method: m, totalWeightKg: 0.4 })).toBe(30000);
    expect(computeFee({ method: m, totalWeightKg: 1 })).toBe(30000);
    expect(computeFee({ method: m, totalWeightKg: 2.2 })).toBe(90000);
  });

  it("charges per item", () => {
    const m = method({ pricing: { mode: "per_item", perItemFee: 20000 } });
    expect(computeFee({ method: m, totalQty: 3 })).toBe(60000);
  });

  it("charges nothing in free mode", () => {
    expect(computeFee({ method: method({ pricing: { mode: "free" } }) })).toBe(0);
  });

  it("lets a zone override the method price", () => {
    const zone = { feeOverride: 0 };
    expect(computeFee({ method: method(), zone, subtotal: 1000 })).toBe(0);
  });

  it("applies the free-shipping threshold to an overridden zone price", () => {
    // The override is a price, not a promise that outranks the store's
    // free-shipping offer.
    const zone = { feeOverride: 60000 };
    const m = method({ pricing: { mode: "flat", flatFee: 45000, freeThreshold: 500000 } });
    expect(computeFee({ method: m, zone, subtotal: 400000 })).toBe(60000);
    expect(computeFee({ method: m, zone, subtotal: 500000 })).toBe(0);
  });

  it("honours a store-wide threshold on top of the method's own", () => {
    const m = method({ pricing: { mode: "flat", flatFee: 45000, freeThreshold: 1000000 } });
    expect(computeFee({ method: m, subtotal: 600000, profileFreeThreshold: 500000 })).toBe(0);
    expect(computeFee({ method: m, subtotal: 400000, profileFreeThreshold: 500000 })).toBe(45000);
  });

  it("never returns a negative or absurd fee", () => {
    expect(computeFee({ method: method({ pricing: { mode: "per_item", perItemFee: 0 } }), totalQty: 5 })).toBe(0);
    expect(
      computeFee({ method: method({ pricing: { mode: "weight", perKgFee: MAX_FEE } }), totalWeightKg: 9999 }),
    ).toBe(MAX_FEE);
  });
});

describe("quoteProfile", () => {
  it("leaves an unconfigured store open, with a warning and no methods", () => {
    // Decision of record: a seller who has not opened the shipping screen must
    // still be able to trade.
    for (const p of [null, { isEnabled: false, methods: [] }, { isEnabled: true, methods: [] }]) {
      const quote = quoteProfile({ profile: p, address: TEHRAN, subtotal: 100000 });
      expect(quote.configured).toBe(false);
      expect(quote.methods).toEqual([]);
      expect(quote.warning).toContain("تنظیم نکرده");
    }
  });

  it("excludes a disabled method", () => {
    const quote = quoteProfile({
      profile: profile({ methods: [method({ enabled: false })] }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.configured).toBe(false);
  });

  it("quotes several methods cheapest first", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({ key: "post", title: "پست", pricing: { mode: "flat", flatFee: 45000 } }),
          method({ key: "tipax", title: "تیپاکس", pricing: { mode: "flat", flatFee: 80000 } }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.configured).toBe(true);
    expect(quote.methods.map((m) => m.key)).toEqual(["post", "tipax"]);
  });

  it("orders equal prices stably so the UI does not reshuffle", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({ key: "zeta", title: "ز" }),
          method({ key: "alpha", title: "ا" }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.methods.map((m) => m.key)).toEqual(["alpha", "zeta"]);
  });

  it("carries the pickup address so the buyer knows where to come", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({
            key: "pickup",
            title: "دریافت حضوری",
            kind: "pickup",
            pricing: { mode: "free" },
            pickup: { address: "تهران، خیابان آزادی، پلاک ۱۲", city: "تهران", hours: "۹ تا ۱۸" },
          }),
        ],
      }),
      address: {},
      subtotal: 100000,
    });
    expect(quote.methods).toHaveLength(1);
    expect(quote.methods[0].fee).toBe(0);
    expect(quote.methods[0].pickup.address).toContain("آزادی");
    expect(quote.methods[0].pickup.hours).toBe("۹ تا ۱۸");
  });

  it("warns instead of returning an empty list for an uncovered destination", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({
            key: "mashhad-only",
            zones: [
              { label: "مشهد", type: "province", enabled: true, provinces: ["خراسان رضوی"] },
            ],
          }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.configured).toBe(true);
    expect(quote.methods).toEqual([]);
    expect(quote.warning).toContain("در دسترس نیست");
  });

  it("hides a per-kilogram method rather than quoting it as free", () => {
    // 0 kg × per-kg fee = 0, which would hand the buyer free shipping the seller
    // never agreed to. The method is hidden, with a reason the seller can act on.
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({ key: "bykg", title: "بر اساس وزن", pricing: { mode: "weight", perKgFee: 30000 } }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
      totalWeightKg: 0,
    });
    expect(quote.configured).toBe(true);
    expect(quote.methods).toEqual([]);
    expect(quote.unavailable).toEqual([
      { key: "bykg", title: "بر اساس وزن", reason: "وزن این کالاها ثبت نشده است" },
    ]);
  });

  it("offers a per-kilogram method once a weight is declared", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({ key: "bykg", title: "بر اساس وزن", pricing: { mode: "weight", perKgFee: 30000 } }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
      totalWeightKg: 1.2,
    });
    expect(quote.methods).toHaveLength(1);
    expect(quote.methods[0].fee).toBe(60000);
  });

  it("explains a method hidden by coverage, not by weight", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({
            key: "mashhad",
            title: "ارسال مشهد",
            zones: [{ label: "مشهد", type: "province", enabled: true, provinces: ["خراسان رضوی"] }],
          }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.unavailable[0].key).toBe("mashhad");
    expect(quote.unavailable[0].reason).toContain("در دسترس نیست");
  });

  it("treats an all-blank address object as no address at all", () => {
    // A pickup checkout posts `shippingAddress: {}` because the form has the
    // field but the buyer used none of it.
    expect(isEmptyAddress({})).toBe(true);
    expect(isEmptyAddress({ receiverName: "  ", line1: "" })).toBe(true);
    expect(isEmptyAddress(null)).toBe(true);
  });

  it("does not excuse a half-typed address", () => {
    // One field filled in is a typo, not an absent address.
    expect(isEmptyAddress({ city: "تهران" })).toBe(false);
    expect(isEmptyAddress({ receiverName: "علی" })).toBe(false);
  });

  it("never returns a maxDays below minDays", () => {    const quote = quoteProfile({
      profile: profile({ methods: [method({ eta: { minDays: 5, maxDays: 2 } })] }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.methods[0].eta).toEqual({ minDays: 5, maxDays: 5 });
  });

  it("snapshots the matched zone label and its ETA override", () => {
    const quote = quoteProfile({
      profile: profile({
        methods: [
          method({
            zones: [
              { label: "نزدیک", type: "radius", enabled: true, center: { lat: 35.6892, lng: 51.389 }, radiusKm: 20, feeOverride: 0, etaOverride: { minDays: 1, maxDays: 1 } },
              { label: "دور", type: "all", enabled: true },
            ],
          }),
        ],
      }),
      address: TEHRAN,
      subtotal: 100000,
    });
    expect(quote.methods[0].zoneLabel).toBe("نزدیک");
    expect(quote.methods[0].fee).toBe(0);
    expect(quote.methods[0].eta).toEqual({ minDays: 1, maxDays: 1 });
  });
});

describe("computeTierFee (Phase 37)", () => {
  const tiers = [
    { upToKg: 1, price: 60000 },
    { upToKg: 3, price: 110000 },
    { upToKg: 10, price: 240000 },
  ];

  it("falls back to a flat per-kg rate when the seller wrote no steps", () => {
    expect(computeTierFee([], 2.4, 40000)).toBe(3 * 40000);
  });

  it("picks the step whose inclusive bound covers the billed kilogram", () => {
    expect(computeTierFee(tiers, 0.4, 0)).toBe(60000);
    expect(computeTierFee(tiers, 2.4, 0)).toBe(110000);
    expect(computeTierFee(tiers, 9.9, 0)).toBe(240000);
  });

  it("uses the same whole kilo the courier bills, so 0.9 kg is not cheaper than 1 kg", () => {
    // This is the boundary that matters: rounding the bracket down would make
    // every parcel just under a step boundary cheaper than the step above it.
    expect(computeTierFee(tiers, 0.999, 0)).toBe(60000);
    expect(computeTierFee(tiers, 1.0, 0)).toBe(60000);
    expect(computeTierFee(tiers, 1.001, 0)).toBe(110000);
  });

  it("holds the top step flat above it rather than guessing upward", () => {
    // No rate card covers 40 kg. The buyer still needs a number, and inventing
    // one would be a lie about a price nobody agreed to.
    expect(computeTierFee(tiers, 40, 0)).toBe(240000);
  });

  it("re-sorts an unsorted list instead of trusting the caller's order", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    expect(computeTierFee(shuffled, 0.5, 0)).toBe(60000);
  });
});

describe("resolveShippingDiscount (Phase 37)", () => {
  const withDiscounts = (discounts) => profile({ discounts });

  it("applies a percent code to the delivery charge only", () => {
    const p = withDiscounts([
      { code: "SHIP50", type: "percent", value: 50, minSubtotal: 0, maxDiscount: 1000000, enabled: true },
    ]);
    const r = resolveShippingDiscount({ profile: p, code: "SHIP50", fee: 90000, subtotal: 500000 });
    expect(r).toMatchObject({ amount: 45000, code: "SHIP50", applied: true });
  });

  it("matches a code case-insensitively and trims it", () => {
    const p = withDiscounts([
      { code: "SHIP50", type: "percent", value: 50, minSubtotal: 0, maxDiscount: 1000000, enabled: true },
    ]);
    expect(resolveShippingDiscount({ profile: p, code: "  ship50 ", fee: 90000, subtotal: 0 }).amount).toBe(45000);
  });

  it("never discounts more than maxDiscount", () => {
    const p = withDiscounts([
      { code: "BIG", type: "fixed", value: 900000, minSubtotal: 0, maxDiscount: 40000, enabled: true },
    ]);
    expect(resolveShippingDiscount({ profile: p, code: "BIG", fee: 90000, subtotal: 0 }).amount).toBe(40000);
  });

  it("never discounts more than the fee — the unbounded-loss clamp", () => {
    // A fixed code larger than the charge would otherwise pay the buyer to shop.
    // This is the exact trap Phase 35 flagged for "free shipping above X".
    const p = withDiscounts([
      { code: "HUGE", type: "fixed", value: 5000000, minSubtotal: 0, maxDiscount: 5000000, enabled: true },
    ]);
    const r = resolveShippingDiscount({ profile: p, code: "HUGE", fee: 200000, subtotal: 100000 });
    expect(r.amount).toBe(200000);
  });

  it("applies nothing below minSubtotal but says why, so the buyer can add an item", () => {
    const p = withDiscounts([
      { code: "SHIP50", type: "percent", value: 50, minSubtotal: 1000000, maxDiscount: 900000, enabled: true },
    ]);
    const r = resolveShippingDiscount({ profile: p, code: "SHIP50", fee: 90000, subtotal: 500000 });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("SHIPPING_DISCOUNT_MIN_SUBTOTAL");
  });

  it("treats an unknown code and another store's code identically", () => {
    // The whole point: a code that exists nowhere in THIS profile is a plain
    // lookup miss, so the response cannot enumerate other sellers' campaigns.
    const mine = withDiscounts([
      { code: "MINE", type: "percent", value: 10, minSubtotal: 0, maxDiscount: 1000, enabled: true },
    ]);
    const unknown = resolveShippingDiscount({ profile: mine, code: "THEIRS", fee: 90000, subtotal: 0 });
    const typo = resolveShippingDiscount({ profile: mine, code: "MINEE", fee: 90000, subtotal: 0 });
    expect(unknown).toEqual(typo);
    expect(unknown.applied).toBe(false);
  });

  it("ignores a disabled code", () => {
    const p = withDiscounts([
      { code: "OLD", type: "percent", value: 90, minSubtotal: 0, maxDiscount: 900000, enabled: false },
    ]);
    expect(resolveShippingDiscount({ profile: p, code: "OLD", fee: 90000, subtotal: 0 }).applied).toBe(false);
  });

  it("is a no-op when there is no charge to reduce", () => {
    const p = withDiscounts([
      { code: "SHIP50", type: "percent", value: 50, minSubtotal: 0, maxDiscount: 900000, enabled: true },
    ]);
    // Free-shipping methods and unconfigured stores land here. Applying a
    // "discount" to zero would report a saving the buyer never received.
    expect(resolveShippingDiscount({ profile: p, code: "SHIP50", fee: 0, subtotal: 0 }).applied).toBe(false);
  });

  it("is a no-op with no code at all", () => {
    expect(resolveShippingDiscount({ profile: profile(), code: "", fee: 90000, subtotal: 0 })).toMatchObject({
      amount: 0,
      applied: false,
    });
  });
});

describe("quoteProfile with weight tiers and discount codes (Phase 37)", () => {
  const weightMethod = method({
    key: "post-heavy",
    pricing: {
      mode: "weight",
      flatFee: 0,
      perKgFee: 0,
      perItemFee: 0,
      freeThreshold: 0,
      tiers: [
        { upToKg: 1, price: 60000 },
        { upToKg: 5, price: 150000 },
      ],
    },
  });

  const withCode = profile({
    methods: [weightMethod],
    discounts: [
      { code: "SHIP30", type: "percent", value: 30, minSubtotal: 0, maxDiscount: 50000, enabled: true },
    ],
  });

  it("prices from the seller's steps, not a per-kg multiplication", () => {
    const q = quoteProfile({ profile: withCode, address: TEHRAN, totalWeightKg: 3.2 });
    expect(q.methods[0].fee).toBe(150000);
    expect(q.methods[0].originalFee).toBe(150000);
  });

  it("reports the discounted fee alongside what the rate card asked for", () => {
    const q = quoteProfile({ profile: withCode, address: TEHRAN, totalWeightKg: 3.2, discountCode: "SHIP30" });
    const m = q.methods[0];
    expect(m.originalFee).toBe(150000);
    expect(m.discount).toBe(45000);
    expect(m.fee).toBe(105000);
    expect(m.discountCode).toBe("SHIP30");
  });

  it("clamps a percent discount that exceeds maxDiscount", () => {
    // 30% of 150000 is 45000, under the 50000 cap. Push the price up so the raw
    // amount crosses it, proving the cap is doing the work.
    const heavy = profile({
      methods: [method({ pricing: { ...weightMethod.pricing, tiers: [{ upToKg: 5, price: 400000 }] } })],
      discounts: [
        { code: "SHIP30", type: "percent", value: 30, minSubtotal: 0, maxDiscount: 50000, enabled: true },
      ],
    });
    const m = quoteProfile({ profile: heavy, address: TEHRAN, totalWeightKg: 2, discountCode: "SHIP30" }).methods[0];
    expect(m.originalFee).toBe(400000);
    expect(m.discount).toBe(50000);
    expect(m.fee).toBe(350000);
  });

  it("clamps each method against its own charge, not the cheapest one", () => {
    // A fixed code resolved once against the cheapest method and then applied
    // everywhere would give the expensive method a discount it never earned.
    const two = profile({
      methods: [
        method({ key: "cheap", pricing: { mode: "flat", flatFee: 50000, freeThreshold: 0 } }),
        method({ key: "express", pricing: { mode: "flat", flatFee: 200000, freeThreshold: 0 } }),
      ],
      discounts: [
        { code: "FLAT", type: "fixed", value: 40000, minSubtotal: 0, maxDiscount: 40000, enabled: true },
      ],
    });
    const q = quoteProfile({ profile: two, address: TEHRAN, subtotal: 500000, discountCode: "FLAT" });
    const byKey = Object.fromEntries(q.methods.map((m) => [m.key, m]));
    expect(byKey.cheap.discount).toBe(40000);
    expect(byKey.express.discount).toBe(40000);
    expect(byKey.cheap.fee).toBe(10000);
    expect(byKey.express.fee).toBe(160000);
  });

  it("tells the caller the code was not honoured instead of silently charging full price", () => {
    const q = quoteProfile({ profile: withCode, address: TEHRAN, totalWeightKg: 2, discountCode: "NOPE" });
    expect(q.discount.rejected).toBe(true);
    expect(q.discount.applied).toBe(false);
    expect(q.methods[0].fee).toBe(150000);
  });

  it("reports a code as rejected for an unconfigured store too", () => {
    const q = quoteProfile({ profile: { isEnabled: false, methods: [] }, discountCode: "SHIP30" });
    expect(q.configured).toBe(false);
    expect(q.discount.rejected).toBe(true);
  });
});

describe("ShippingDomainError", () => {
  it("carries a machine-readable code", () => {
    const err = new ShippingDomainError("INVALID_PROFILE", "x", { errors: ["a"] });
    expect(err.code).toBe("INVALID_PROFILE");
    expect(err.details.errors).toEqual(["a"]);
  });
});
