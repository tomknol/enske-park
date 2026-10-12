import { describe, expect, it } from "vitest";
import {
  CENTRE_FILL_BASE,
  CENTRE_LINE_OPACITY_REST,
  ZONE_FILL_BASE,
  ZONE_LINE_WIDTH_BASE,
  ZONE_LINE_WIDTH_CURRENT,
  ZONE_LINE_WIDTH_HOVER,
  ZONE_LINE_WIDTH_SELECTED,
  computeZoneFeatureState,
  zoneLineWidthForState,
} from "@/lib/zone-map-highlight";
import { isCentrePaidZone, zoneFillColor, zoneLineActiveColor, zoneLineColor } from "@/lib/zones";

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

  it("keeps a selected border when the zone is also the GPS zone", () => {
    const state = computeZoneFeatureState("paid:1", "paid:1", "paid:1", null);
    expect(state.current).toBe(true);
    expect(state.selected).toBe(true);
    expect(zoneLineWidthForState(state)).toBe(ZONE_LINE_WIDTH_SELECTED);
    expect(zoneLineWidthForState(state)).toBeGreaterThan(ZONE_LINE_WIDTH_CURRENT);
  });

  it("orders the stroke from quiet to selected", () => {
    const base = zoneLineWidthForState({ current: false, selected: false, hover: false });
    const hover = zoneLineWidthForState({ current: false, selected: false, hover: true });
    const current = zoneLineWidthForState({ current: true, selected: false, hover: false });
    const selected = zoneLineWidthForState({ current: false, selected: true, hover: false });
    expect(base).toBe(ZONE_LINE_WIDTH_BASE);
    expect(hover).toBe(ZONE_LINE_WIDTH_HOVER);
    expect(current).toBe(ZONE_LINE_WIDTH_CURRENT);
    expect(selected).toBeGreaterThan(current);
    expect(current).toBeGreaterThan(hover);
    expect(hover).toBeGreaterThan(base);
    expect(selected).toBeGreaterThanOrEqual(3);
    expect(selected).toBeLessThanOrEqual(4);
  });

  it("clears hover when the pointer leaves", () => {
    const state = computeZoneFeatureState("paid:1", "paid:1", null, null);
    expect(state.current).toBe(true);
    expect(state.hover).toBe(false);
  });
});

function channelLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

describe("centre zone resting intensity", () => {
  it("keeps zone 1 burgundy and zones 2–8 amber", () => {
    expect(isCentrePaidZone("1")).toBe(true);
    expect(isCentrePaidZone("1B")).toBe(true);
    expect(isCentrePaidZone("4")).toBe(false);
    expect(zoneFillColor("1", "paid")).toBe("#8f3d4a");
    expect(zoneFillColor("4", "paid")).toBe("#9a6838");
  });

  it("quiets the resting fill and stroke without changing the burgundy hue", () => {
    const line = zoneLineColor("1", "paid");
    expect(line).toBe("#b8707c");
    expect(channelLuminance(line)).toBeGreaterThan(0.15);
    expect(CENTRE_FILL_BASE).toBeLessThan(ZONE_FILL_BASE);
    expect(CENTRE_LINE_OPACITY_REST).toBeLessThan(0.48);
    const active = zoneLineActiveColor("1", "paid");
    expect(active).not.toBe(line);
    expect(channelLuminance(active)).toBeGreaterThan(channelLuminance(line));
  });
});
