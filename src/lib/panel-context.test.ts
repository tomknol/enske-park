import { describe, expect, it } from "vitest";
import {
  hoverReplacesContext,
  isSameSelectedZone,
  type MapPanelContext,
} from "@/lib/panel-context";

const zone4: MapPanelContext = {
  type: "zone",
  kind: "paid",
  zoneRaw: "4",
};

describe("hoverReplacesContext", () => {
  const zone8: MapPanelContext = { type: "zone", kind: "paid", zoneRaw: "8" };
  const garage = {
    kind: "garage" as const,
    garage: {
      id: "van-heek",
      label: "Van Heek",
      shortLabel: "Van Heek",
      lat: 52.22,
      lon: 6.89,
      vacant: 10,
      capacity: 100,
      live: true,
      level: "plenty" as const,
      lastUpdated: 1,
    },
  };

  it("keeps any explicit selection in the panel", () => {
    expect(hoverReplacesContext(garage, zone8)).toBe(false);
    expect(hoverReplacesContext({ kind: "paid", zoneRaw: "2" }, zone8)).toBe(false);
    expect(hoverReplacesContext({ kind: "stadserf-access", id: "de-heurne" }, zone8)).toBe(
      false,
    );
    expect(hoverReplacesContext({ kind: "paid", zoneRaw: "1" }, { type: "garage", garage: garage.garage })).toBe(
      false,
    );
    expect(hoverReplacesContext(null, zone8)).toBe(false);
  });

  it("previews a hover when nothing is selected", () => {
    expect(hoverReplacesContext(garage, null)).toBe(true);
    expect(hoverReplacesContext({ kind: "paid", zoneRaw: "6" }, null)).toBe(true);
    expect(hoverReplacesContext({ kind: "outside" }, null)).toBe(true);
    expect(hoverReplacesContext({ kind: "stadserf" }, { type: "live" })).toBe(true);
    expect(hoverReplacesContext(null, null)).toBe(false);
  });

  it("does not let an outside-zone hover replace a selection", () => {
    expect(hoverReplacesContext({ kind: "outside" }, zone8)).toBe(false);
  });
});

describe("isSameSelectedZone", () => {
  it("matches the same zone id and ignores case", () => {
    expect(isSameSelectedZone(zone4, "paid", "4")).toBe(true);
    expect(isSameSelectedZone(zone4, "paid", " 4 ")).toBe(true);
    expect(isSameSelectedZone({ ...zone4, zoneRaw: "1b" }, "paid", "1B")).toBe(true);
  });

  it("does not match a different zone or a non-zone selection", () => {
    expect(isSameSelectedZone(zone4, "paid", "6")).toBe(false);
    expect(isSameSelectedZone(zone4, "permit", "4")).toBe(false);
    expect(isSameSelectedZone(null, "paid", "4")).toBe(false);
    expect(
      isSameSelectedZone(
        {
          type: "destination",
          label: "Oude Markt",
          lon: 6.89,
          lat: 52.22,
          kind: "paid",
          zoneRaw: "4",
        },
        "paid",
        "4",
      ),
    ).toBe(false);
  });
});
