import { describe, expect, it } from "vitest";
import centroid from "@turf/centroid";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { fromZonedTime } from "date-fns-tz";
import { resolveMapActivation } from "@/lib/map-activation";
import {
  formatStadserfDayPermitPrice,
  stadserfAccessWindowCopy,
  stadserfPolygonFeature,
} from "@/lib/stadserf";
import {
  buildStadserfAccessCollection,
  distanceToStadserfRingMeters,
  getStadserfAccessPoint,
  stadserfAccessDirectionLabel,
  stadserfAccessPoints,
} from "@/lib/stadserf-access";

const TZ = "Europe/Amsterdam";

function ams(
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
  s = 0,
): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${y}-${p(m)}-${p(d)}T${p(h)}:${p(min)}:${p(s)}`, TZ);
}

const PRINCIPAL_ROADS = [
  "Korte Hengelosestraat",
  "Van Lochemstraat",
  "De Heurne",
  "De Klomp",
  "Kalandergang",
  "Nijverheidstraat",
  "Brammelerstraat",
] as const;

describe("stadserf access points", () => {
  it("includes the current principal vehicle access roads", () => {
    const names = stadserfAccessPoints().map((point) => point.name);
    expect(names).toEqual([...PRINCIPAL_ROADS]);
    expect(names).not.toContain("Nijverheidsstraat");
  });

  it("sits on the Stadserf boundary, not a street or zone centroid", () => {
    const interior = centroid(stadserfPolygonFeature());
    for (const access of stadserfAccessPoints()) {
      expect(distanceToStadserfRingMeters(access.lon, access.lat)).toBeLessThan(0.5);
      expect(
        distance(point([access.lon, access.lat]), interior, { units: "meters" }),
      ).toBeGreaterThan(80);
    }
  });

  it("keeps official two-way access from the 2025 bebording", () => {
    for (const point of stadserfAccessPoints()) {
      expect(point.direction).toBe("both");
      expect(point.source).toMatch(/Binnenstad in \+ uit/);
    }
  });

  it("anchors GeoJSON to the stored boundary-crossing coordinates", () => {
    const features = buildStadserfAccessCollection().features;
    expect(features).toHaveLength(PRINCIPAL_ROADS.length);
    for (const feature of features) {
      const access = getStadserfAccessPoint(String(feature.id));
      expect(access).toBeDefined();
      expect(feature.geometry.coordinates).toEqual([access!.lon, access!.lat]);
      expect(feature.properties).toMatchObject({
        kind: "stadserf-access",
        direction: "both",
        name: access!.name,
      });
    }
  });
});

describe("stadserf access panel copy", () => {
  it("states one-way and two-way access in words", () => {
    expect(stadserfAccessDirectionLabel("entry")).toBe("Alleen ingang");
    expect(stadserfAccessDirectionLabel("exit")).toBe("Alleen uitgang");
    expect(stadserfAccessDirectionLabel("both")).toBe("In- en uitgang");
  });

  it("reuses the 07:00–11:00 window countdown", () => {
    const copy = stadserfAccessWindowCopy(ams(2026, 10, 12, 9, 35, 42));
    expect(copy.title).toBe("Venstertijd actief");
    expect(copy.detail).toBe("Nog 01:24:18 · voor laden/lossen");
  });

  it("reuses the day-access exemption outside the window", () => {
    const copy = stadserfAccessWindowCopy(ams(2026, 10, 12, 11, 0, 0));
    expect(copy.title).toBe("Ontheffing vereist");
    expect(copy.detail).toBe(
      `Dagontheffing toegang ${formatStadserfDayPermitPrice()}`,
    );
  });
});

describe("stadserf access map activation", () => {
  const zone1 = {
    layerId: "paid-zones-fill",
    zoneRaw: "1",
    gebiedCod: "1",
  };

  it("lets an access marker win over the Stadserf fill and Zone 1", () => {
    expect(
      resolveMapActivation(
        { kind: "stadserf-access", id: "de-heurne" },
        true,
        zone1,
      ),
    ).toEqual({ type: "stadserf-access", id: "de-heurne" });
  });

  it("keeps garage markers above access openings", () => {
    expect(
      resolveMapActivation({ kind: "garage", id: "irene" }, true, zone1),
    ).toEqual({ type: "garage", id: "irene" });
  });

  it("still selects the Stadserf when the tap is inside but not on an opening", () => {
    expect(resolveMapActivation(null, true, zone1)).toEqual({ type: "stadserf" });
  });
});
