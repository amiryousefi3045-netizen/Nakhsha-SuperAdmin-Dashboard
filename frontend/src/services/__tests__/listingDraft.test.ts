/**
 * Unit tests for buildListingDraftPayload.
 * Covers all four listing types, location conversion, and null behaviour.
 */
import { describe, it, expect } from "vitest";
import { buildListingDraftPayload } from "../listingDraft";
import type { WizardListingDraft } from "../../types/listing";

// ── Shared base fields ────────────────────────────────────────────────────────

const BASE_FIELDS = {
  title: "کوزه سفالین",
  description: "یک کوزه سفالین دست‌ساز از یزد",
  tags: ["سفالگری", "یزد"],
  images: [] as File[],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildListingDraftPayload", () => {
  // ── 1. post ────────────────────────────────────────────────────────────────

  it("builds a post payload with only post-specific details", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "post",
      location: { lat: 35.7219, lng: 51.3347 },
      price: 250_000,
      forSale: true,
      category: "سفالگری",
      attributes: { جنس: "گِل", رنگ: "فیروزه‌ای" },
    };

    const payload = buildListingDraftPayload(draft);

    expect(payload.type).toBe("post");
    expect(payload.title).toBe("کوزه سفالین");
    expect(payload.tags).toEqual(["سفالگری", "یزد"]);
    expect(payload.images).toEqual([]);
    expect(payload.details.price).toBe(250_000);
    expect(payload.details.forSale).toBe(true);
    expect(payload.details.category).toBe("سفالگری");
    expect(payload.details.attributes).toEqual({
      جنس: "گِل",
      رنگ: "فیروزه‌ای",
    });
    // Must NOT include tour/training-specific keys
    expect("schedule" in payload.details).toBe(false);
    expect("startDate" in payload.details).toBe(false);
  });

  // ── 2. tour ────────────────────────────────────────────────────────────────

  it("builds a tour payload without a schedule field", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "tour",
      location: { lat: 32.6539, lng: 59.2164 },
      startDate: "2026-05-10",
      durationDays: 3,
      capacity: 12,
      itinerary: "بازدید از بازار قیصریه، کارگاه فرش",
    };

    const payload = buildListingDraftPayload(draft);

    expect(payload.type).toBe("tour");
    expect(payload.details.startDate).toBe("2026-05-10");
    expect(payload.details.durationDays).toBe(3);
    expect(payload.details.capacity).toBe(12);
    expect(payload.details.itinerary).toBe(
      "بازدید از بازار قیصریه، کارگاه فرش",
    );
    // Must NOT contain schedule
    expect("schedule" in payload.details).toBe(false);
  });

  // ── 3. training ────────────────────────────────────────────────────────────

  it("builds a training payload that includes schedule", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "training",
      location: { lat: 36.2972, lng: 59.6067 },
      schedule: [
        { dayOfWeek: 6, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "15:00", endTime: "18:00" },
      ],
      level: "beginner",
      instructor: "استاد رضایی",
    };

    const payload = buildListingDraftPayload(draft);

    expect(payload.type).toBe("training");
    expect(Array.isArray(payload.details.schedule)).toBe(true);
    expect((payload.details.schedule as unknown[]).length).toBe(2);
    expect(payload.details.level).toBe("beginner");
    expect(payload.details.instructor).toBe("استاد رضایی");
    // Must NOT include tour-specific keys
    expect("startDate" in payload.details).toBe(false);
    expect("itinerary" in payload.details).toBe(false);
  });

  // ── 4. academy ─────────────────────────────────────────────────────────────

  it("builds an academy payload without a schedule field", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "academy",
      location: { lat: 35.6892, lng: 51.389 },
      phone: "02112345678",
      website: "https://academy.example.ir",
      workingHours: "شنبه تا چهارشنبه ۹–۱۷",
      addressDetails: "پاساژ هنر، واحد ۱۲",
    };

    const payload = buildListingDraftPayload(draft);

    expect(payload.type).toBe("academy");
    expect(payload.details.phone).toBe("02112345678");
    expect(payload.details.website).toBe("https://academy.example.ir");
    expect(payload.details.workingHours).toBe("شنبه تا چهارشنبه ۹–۱۷");
    expect(payload.details.addressDetails).toBe("پاساژ هنر، واحد ۱۲");
    // Must NOT contain schedule
    expect("schedule" in payload.details).toBe(false);
  });

  // ── Location conversion ────────────────────────────────────────────────────

  it("converts valid lat/lng to GeoJSON Point [lng, lat]", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "post",
      location: { lat: 35.7219, lng: 51.3347 },
    };

    const payload = buildListingDraftPayload(draft);

    expect(payload.location).toEqual({
      type: "Point",
      coordinates: [51.3347, 35.7219], // [lng, lat]
    });
  });

  it("returns null location when lat is null", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "post",
      location: { lat: null, lng: 51.3347 },
    };

    expect(buildListingDraftPayload(draft).location).toBeNull();
  });

  it("returns null location when lng is null", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "tour",
      location: { lat: 35.7219, lng: null },
    };

    expect(buildListingDraftPayload(draft).location).toBeNull();
  });

  it("returns null location when both coordinates are null", () => {
    const draft: WizardListingDraft = {
      ...BASE_FIELDS,
      listingType: "training",
      location: { lat: null, lng: null },
      schedule: [],
    };

    expect(buildListingDraftPayload(draft).location).toBeNull();
  });
});
