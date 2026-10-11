import { describe, expect, it } from "vitest";
import { computeZoneFeatureState } from "@/lib/zone-map-highlight";

describe("computeZoneFeatureState", () => {
  it("keeps hover on the current GPS zone", () => {
    const state = computeZoneFeatureState("paid:1", "paid:1", null, "paid:1");
    expect(state.current).toBe(true);
    expect(state.hover).toBe(true);
    expect(state.selected).toBe(false);
  });

  it("keeps hover on a selected non-current zone", () => {
    const state = computeZoneFeatureState("paid:4", "paid:1", "paid:4", "paid:4");
    expect(state.current).toBe(false);
    expect(state.selected).toBe(true);
    expect(state.hover).toBe(true);
  });

  it("applies the same hover flag to zone 1B as to other paid zones", () => {
    const centre = computeZoneFeatureState("paid:1B", null, null, "paid:1B");
    const other = computeZoneFeatureState("paid:7", null, null, "paid:7");
    expect(centre).toEqual(other);
    expect(centre.hover).toBe(true);
    expect(centre.current).toBe(false);
  });

  it("clears hover when the pointer leaves", () => {
    const state = computeZoneFeatureState("paid:1", "paid:1", null, null);
    expect(state.current).toBe(true);
    expect(state.hover).toBe(false);
  });
});
