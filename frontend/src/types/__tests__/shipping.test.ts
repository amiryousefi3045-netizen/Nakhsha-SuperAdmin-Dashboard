import { describe, expect, it } from "vitest";
import {
  SHIPPING_CODE_PATTERN,
  SHIPPING_LIMITS,
  tierFeeFor,
  type ShippingTier,
} from "../shipping";

/**
 * `tierFeeFor` exists so the seller form can show a number while typing. If it
 * ever disagrees with `ShippingService.computeTierFee`, the form would promise a
 * price the order does not charge — so these cases mirror the server's tests
 * one-for-one rather than inventing their own.
 */
describe("tierFeeFor", () => {
  const CARD: ShippingTier[] = [
    { upToKg: 1, price: 45000 },
    { upToKg: 5, price: 120000 },
    { upToKg: 20, price: 300000 },
  ];

  it("charges the first step at the bottom of its bracket", () => {
    // 1 kg is INSIDE the "up to 1 kg" step, not in the next one.
    expect(tierFeeFor(CARD, 0.4)).toBe(45000);
    expect(tierFeeFor(CARD, 1)).toBe(45000);
  });

  it("moves to the next step above the bound, not at it", () => {
    expect(tierFeeFor(CARD, 1.1)).toBe(120000);
    expect(tierFeeFor(CARD, 5)).toBe(120000);
    expect(tierFeeFor(CARD, 5.1)).toBe(300000);
    expect(tierFeeFor(CARD, 20)).toBe(300000);
  });

  it("holds the last step above the top of the card", () => {
    // The server does the same, and the form says so in words next to the
    // editor. Silently showing a cheaper number here would be a lie the seller
    // finds out about from a support ticket.
    expect(tierFeeFor(CARD, 30)).toBe(300000);
  });

  it("sorts a card that arrived out of order rather than trusting it", () => {
    const shuffled = [CARD[2], CARD[0], CARD[1]];
    expect(tierFeeFor(shuffled, 3)).toBe(120000);
  });

  it("returns nothing for an empty card instead of inventing a price", () => {
    expect(tierFeeFor([], 5)).toBe(0);
  });
});

describe("SHIPPING_CODE_PATTERN", () => {
  it("accepts the shapes a seller would actually publish", () => {
    expect(SHIPPING_CODE_PATTERN.test("SUMMER")).toBe(true);
    expect(SHIPPING_CODE_PATTERN.test("SHIP30")).toBe(true);
    expect(SHIPPING_CODE_PATTERN.test("SUMMER-1405")).toBe(true);
  });

  it("refuses what the server refuses", () => {
    // Persian letters, spaces and a too-short code are the three mistakes a
    // seller actually makes; catching them in the form saves a round-trip.
    expect(SHIPPING_CODE_PATTERN.test("تابستان")).toBe(false);
    expect(SHIPPING_CODE_PATTERN.test("SHIP 30")).toBe(false);
    expect(SHIPPING_CODE_PATTERN.test("AB")).toBe(false);
    expect(SHIPPING_CODE_PATTERN.test("A".repeat(SHIPPING_LIMITS.maxCodeLength + 1))).toBe(false);
  });
});