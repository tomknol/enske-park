import { describe, expect, it } from "vitest";
import { ZONE_FILL_BASE, ZONE_FILL_SELECTED } from "@/lib/zone-map-highlight";
import {
  STADSERF_FILL_BASE,
  STADSERF_LINE_WIDTH_BASE,
  STADSERF_LINE_WIDTH_SELECTED,
  stadserfFillOpacityForState,
  stadserfLineWidthForState,
} from "@/lib/stadserf-paint";

const quiet = { selected: false, hover: false, current: false };

describe("stadserf polygon states", () => {
  it("keeps the resting tint quieter than a paid zone", () => {
    expect(STADSERF_FILL_BASE).toBeLessThan(ZONE_FILL_BASE);
    expect(stadserfFillOpacityForState({ ...quiet, selected: true })).toBeLessThan(
      ZONE_FILL_SELECTED,
    );
  });

  it("ranks selected above hover, and hover above the GPS tint", () => {
    const base = stadserfFillOpacityForState(quiet);
    const current = stadserfFillOpacityForState({ ...quiet, current: true });
    const hover = stadserfFillOpacityForState({ ...quiet, hover: true });
    const selected = stadserfFillOpacityForState({
      selected: true,
      hover: true,
      current: true,
    });
    expect(current).toBeGreaterThan(base);
    expect(hover).toBeGreaterThan(current);
    expect(selected).toBeGreaterThan(hover);
  });

  it("uses one selected border when the area is also the GPS location", () => {
    const width = stadserfLineWidthForState({
      selected: true,
      hover: false,
      current: true,
    });
    expect(width).toBe(STADSERF_LINE_WIDTH_SELECTED);
    expect(width).toBeGreaterThan(stadserfLineWidthForState({ ...quiet, hover: true }));
    expect(STADSERF_LINE_WIDTH_BASE).toBeGreaterThanOrEqual(1.5);
    expect(STADSERF_LINE_WIDTH_BASE).toBeLessThanOrEqual(2);
    expect(width).toBeGreaterThanOrEqual(3);
    expect(width).toBeLessThanOrEqual(4);
  });
});
