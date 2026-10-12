import { describe, expect, it } from "vitest";
import {
  buildAccuracyRing,
  buildDestinationCollection,
  buildGarageCollection,
  buildUserLocationCollection,
  garageDetailText,
} from "@/lib/map-overlays";
import type { GarageMarkerData } from "@/lib/garages";

const garage = (
  overrides: Partial<GarageMarkerData> = {},
): GarageMarkerData => ({
  id: "g1",
  label: "Van Heek",
  shortLabel: "Van Heek",
  lat: 52.216916,
  lon: 6.901198,
  vacant: 84,
  capacity: 200,
  live: true,
  level: "plenty",
  lastUpdated: 1,
  ...overrides,
});

describe("garage overlay labels", () => {
  it("shows the free-space count at every zoom when it is live", () => {
    expect(garageDetailText(garage({ vacant: 184 }))).toBe("P 184");
  });

  it("shows VOL only for a fresh empty garage", () => {
    expect(garageDetailText(garage({ vacant: 0, level: "full" }))).toBe("P VOL");
  });

  it("shows P when occupancy is unavailable", () => {
    expect(
      garageDetailText(garage({ vacant: null, live: false, level: "unknown" })),
    ).toBe("P");
  });

  it("keeps the same lon/lat when the marker text changes", () => {
    const quiet = buildGarageCollection([
      garage({ vacant: null, live: false, level: "unknown" }),
    ]).features[0];
    const live = buildGarageCollection([garage({ vacant: 184 })]).features[0];
    expect(quiet.geometry.coordinates).toEqual([6.901198, 52.216916]);
    expect(live.geometry.coordinates).toEqual(quiet.geometry.coordinates);
    expect(quiet.properties).toMatchObject({ textDetail: "P" });
    expect(live.properties).toMatchObject({ textDetail: "P 184" });
  });
});

describe("map overlay geometry", () => {
  it("keeps GPS point and accuracy ring on the same lon/lat", () => {
    const lon = 6.8937;
    const lat = 52.2215;
    const collection = buildUserLocationCollection(lon, lat, 24);
    const point = collection.features.find((f) => f.geometry.type === "Point");
    const ring = collection.features.find((f) => f.geometry.type === "Polygon");
    expect(point?.geometry).toEqual({ type: "Point", coordinates: [lon, lat] });
    expect(ring?.geometry.type).toBe("Polygon");
    if (ring?.geometry.type !== "Polygon") return;
    const coords = ring.geometry.coordinates[0];
    expect(coords[0]).toEqual(coords[coords.length - 1]);
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    expect(midLon).toBeCloseTo(lon, 6);
    expect(midLat).toBeCloseTo(lat, 6);
  });

  it("anchors a destination to its stored coordinates", () => {
    expect(
      buildDestinationCollection({ lon: 6.89, lat: 52.22 }).features[0].geometry
        .coordinates,
    ).toEqual([6.89, 52.22]);
    expect(buildDestinationCollection(null).features).toHaveLength(0);
  });

  it("closes the accuracy ring", () => {
    const ring = buildAccuracyRing(6.9, 52.22, 40);
    const coords = ring.geometry.coordinates[0];
    expect(coords[0]).toEqual(coords[coords.length - 1]);
  });
});
