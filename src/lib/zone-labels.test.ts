import { describe, expect, it } from "vitest";
import centroid from "@turf/centroid";
import type { Feature, Polygon } from "geojson";
import { buildZoneLabelPoints } from "@/lib/zone-labels";
import type { ZoneCollections, ZoneFeatureProps } from "@/lib/zones";

function square(
  id: string,
  zone: string,
  lon: number,
  lat: number,
): Feature<Polygon, ZoneFeatureProps> {
  const d = 0.002;
  return {
    type: "Feature",
    id,
    properties: { ZONE: zone, GEBIED_COD: id, layer: "paid" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon, lat],
          [lon + d, lat],
          [lon + d, lat + d],
          [lon, lat + d],
          [lon, lat],
        ],
      ],
    },
  };
}

describe("northern Zone 1B label", () => {
  it("pins only the northern 1B label", () => {
    const northern = square("north", "1B", 6.89, 52.225);
    const eastern = square("east", "1B", 6.91, 52.218);
    const zones: ZoneCollections = {
      paid: { type: "FeatureCollection", features: [northern, eastern] },
      permit: { type: "FeatureCollection", features: [] },
    };
    const labels = buildZoneLabelPoints(zones).features.filter(
      (feature) => feature.properties.label === "1B",
    );
    const northLabel = labels.find((feature) => feature.properties.labelId.startsWith("north"));
    const eastLabel = labels.find((feature) => feature.properties.labelId.startsWith("east"));
    expect(northLabel).toBeTruthy();
    expect(eastLabel).toBeTruthy();
    const eastCentroid = centroid(eastern).geometry.coordinates;
    expect(northLabel!.geometry.coordinates).toEqual([6.893458, 52.224134]);
    expect(eastLabel!.geometry.coordinates[0]).toBeCloseTo(eastCentroid[0], 6);
    expect(eastLabel!.geometry.coordinates[1]).toBeCloseTo(eastCentroid[1], 6);
  });
});
