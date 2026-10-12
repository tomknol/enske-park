import { describe, expect, it } from "vitest";
import {
  buildAccuracyRing,
  buildDestinationCollection,
  buildGarageCollection,
  buildPnrCollection,
  buildUserLocationCollection,
  garageOverlayText,
  GARAGE_COUNT_MIN_ZOOM,
} from "@/lib/map-overlays";
import { PNR_ZUIDERVAL } from "@/lib/pnr-zuiderval";
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
  it("keeps compact P below the count zoom", () => {
    expect(garageOverlayText(garage(), GARAGE_COUNT_MIN_ZOOM - 0.1)).toBe("P");
  });

  it("shows vacant count from the stored coordinates at street zoom", () => {
    expect(garageOverlayText(garage(), GARAGE_COUNT_MIN_ZOOM)).toBe("P 84");
  });

  it("anchors garage GeoJSON to the stored lon/lat", () => {
    const feature = buildGarageCollection([garage()]).features[0];
    expect(feature.geometry.coordinates).toEqual([6.901198, 52.216916]);
    expect(feature.properties).toMatchObject({
      kind: "garage",
      textCompact: "P",
      textDetail: "P 84",
    });
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

  it("anchors P+R and destination to their stored coordinates", () => {
    expect(buildPnrCollection().features[0].geometry.coordinates).toEqual([
      PNR_ZUIDERVAL.lon,
      PNR_ZUIDERVAL.lat,
    ]);
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
