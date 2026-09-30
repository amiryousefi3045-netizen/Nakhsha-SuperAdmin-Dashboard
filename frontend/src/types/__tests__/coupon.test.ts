/**
 * Unit tests for the shared coupon contract (Phase 35, P1-07).
 *
 * `isCouponSpendable` is the one piece of client logic that re-implements a
 * server rule. That makes it the one place where the two sides can silently
 * disagree: the seller page would show "spendable" for a code the checkout
 * refuses. So each server-side refusal has a matching case here.
 */
import { describe, it, expect } from "vitest";

import {
  isCouponSpendable,
  COUPON_MAX_PERCENT,
  COUPON_TYPE_LABELS,
  type SellerCoupon,
} from "../coupon";

const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

const base: SellerCoupon = {
  id: "c1",
  code: "SUMMER10",
  description: "",
  type: "percent",
  value: 10,
  maxDiscount: 0,
  minPurchase: 0,
  maxUses: 100,
  maxUsesPerBuyer: 1,
  usedCount: 0,
  remainingUses: 100,
  startsAt: null,
  expiresAt: null,
  status: "active",
};

const spendable = (over: Partial<SellerCoupon> = {}) =>
  isCouponSpendable({ ...base, ...over }, NOW);

describe("isCouponSpendable", () => {
  it("accepts an active campaign with quota and no date window", () => {
    expect(spendable()).toBe(true);
  });

  it("rejects a paused campaign even with quota left", () => {
    // Pausing is a switch, not a limit: no amount of remaining quota revives it.
    expect(spendable({ status: "paused", remainingUses: 50 })).toBe(false);
  });

  it("rejects a campaign whose quota is spent", () => {
    expect(spendable({ remainingUses: 0 })).toBe(false);
  });

  it("treats a negative remainder as spent", () => {
    // Can happen if a seller lowers maxUses under what was already redeemed.
    expect(spendable({ remainingUses: -3 })).toBe(false);
  });

  it("rejects an exhausted campaign even when status still says active", () => {
    // The badge follows the rules, not the stored status, so a campaign that ran
    // out mid-flight is not advertised as usable.
    expect(spendable({ status: "active", usedCount: 100, remainingUses: 0 })).toBe(false);
  });

  it("accepts an unlimited campaign regardless of usedCount", () => {
    // `remainingUses: null` means "no cap", so it is never exhausted.
    expect(spendable({ remainingUses: null, usedCount: 9999, maxUses: 0 })).toBe(true);
  });

  it("rejects a campaign that has not started yet", () => {
    expect(spendable({ startsAt: "2026-07-01T00:00:00.000Z" })).toBe(false);
  });

  it("rejects a campaign that has already expired", () => {
    expect(spendable({ expiresAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("treats the expiry second itself as expired", () => {
    // The server refuses when `expiresAt <= now`, so the boundary must match or
    // the page shows a code that the checkout is already rejecting.
    expect(spendable({ expiresAt: "2026-06-15T12:00:00.000Z" })).toBe(false);
  });

  it("accepts a campaign inside its window", () => {
    expect(
      spendable({
        startsAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2026-06-30T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("rejects a paused campaign whose window has not opened", () => {
    expect(spendable({ status: "paused", startsAt: "2026-07-01T00:00:00.000Z" })).toBe(false);
  });
});

describe("coupon constants", () => {
  it("caps a percentage below 100 so a coupon can never invert the price", () => {
    // A 100% coupon is legal on the backend, but the seller's own UI stops at
    // this ceiling as a guard against a fat-fingered free order.
    expect(COUPON_MAX_PERCENT).toBeLessThan(100);
    expect(COUPON_MAX_PERCENT).toBeGreaterThan(0);
  });

  it("labels both discount kinds", () => {
    expect(COUPON_TYPE_LABELS.percent).toBeTruthy();
    expect(COUPON_TYPE_LABELS.fixed).toBeTruthy();
  });
});
