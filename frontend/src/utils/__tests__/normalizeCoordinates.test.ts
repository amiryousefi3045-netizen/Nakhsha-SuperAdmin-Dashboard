import { describe, it, expect } from "vitest";
import { normalizeCoordinates } from "../normalizeCoordinates";

describe("normalizeCoordinates", () => {
  // ── Priority 1: explicit top-level lat/lng ─────────────────────────────

  it("returns lat/lng from top-level number fields", () => {
    expect(normalizeCoordinates({ lat: 35.6892, lng: 51.389 })).toEqual({
      lat: 35.6892,
      lng: 51.389,
    });
  });

  it("accepts zero as a valid coordinate (lat=0 or lng=0)", () => {
    expect(normalizeCoordinates({ lat: 0, lng: 51.389 })).toEqual({
      lat: 0,
      lng: 51.389,
    });
    expect(normalizeCoordinates({ lat: 35.6892, lng: 0 })).toEqual({
      lat: 35.6892,
      lng: 0,
    });
    expect(normalizeCoordinates({ lat: 0, lng: 0 })).toEqual({
      lat: 0,
      lng: 0,
    });
  });

  it("returns null for non-finite top-level lat/lng", () => {
    expect(normalizeCoordinates({ lat: NaN, lng: 51.389 })).toBeNull();
    expect(normalizeCoordinates({ lat: Infinity, lng: 51.389 })).toBeNull();
    expect(normalizeCoordinates({ lat: 35.6892, lng: NaN })).toBeNull();
  });

  it("treats top-level lat/lng as higher priority than location.coordinates", () => {
    const item = {
      lat: 35.0,
      lng: 51.0,
      location: { coordinates: [60.0, 40.0] as [number, number] },
    };
    expect(normalizeCoordinates(item)).toEqual({ lat: 35.0, lng: 51.0 });
  });

  // ── Priority 2: GeoJSON location.coordinates [lng, lat] ───────────────

  it("reads GeoJSON [lng, lat] from location.coordinates", () => {
    const item = {
      location: { coordinates: [51.389, 35.6892] as [number, number] },
    };
    expect(normalizeCoordinates(item)).toEqual({ lat: 35.6892, lng: 51.389 });
  });

  it("handles location.coordinates with zero longitude", () => {
    const item = {
      location: { coordinates: [0, 35.6892] as [number, number] },
    };
    expect(normalizeCoordinates(item)).toEqual({ lat: 35.6892, lng: 0 });
  });

  it("falls back to location.coordinates when top-level lat is null/undefined", () => {
    const item = {
      lat: null,
      location: { coordinates: [51.389, 35.6892] as [number, number] },
    };
    expect(normalizeCoordinates(item)).toEqual({ lat: 35.6892, lng: 51.389 });
  });

  it("returns null for non-finite location.coordinates", () => {
    expect(
      normalizeCoordinates({ location: { coordinates: [NaN, 35.0] } }),
    ).toBeNull();
    expect(
      normalizeCoordinates({ location: { coordinates: [51.0, Infinity] } }),
    ).toBeNull();
  });

  // ── Priority 3: location.lat / location.lng ────────────────────────────

  it("reads lat/lng from location sub-object when coordinates absent", () => {
    const item = { location: { lat: 35.6892, lng: 51.389 } };
    expect(normalizeCoordinates(item)).toEqual({ lat: 35.6892, lng: 51.389 });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("returns null when item has no coordinate fields", () => {
    expect(normalizeCoordinates({})).toBeNull();
    expect(normalizeCoordinates({ title: "some item" } as any)).toBeNull();
  });

  it("returns null when location is a string", () => {
    expect(normalizeCoordinates({ location: "Tehran" as any })).toBeNull();
  });

  it("returns null when item is an empty object", () => {
    expect(normalizeCoordinates({})).toBeNull();
  });

  it("returns null when location.coordinates array has fewer than 2 elements", () => {
    expect(
      normalizeCoordinates({ location: { coordinates: [51.0] } }),
    ).toBeNull();
  });

  it("handles real-world Tehran coordinates correctly", () => {
    // Backend GeoJSON shape: { type: 'Point', coordinates: [lng, lat] }
    const item = {
      location: {
        type: "Point",
        coordinates: [51.389, 35.6892] as [number, number],
      },
    };
    const result = normalizeCoordinates(item);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(35.6892);
    expect(result!.lng).toBeCloseTo(51.389);
  });
});
