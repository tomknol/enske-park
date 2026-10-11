import area from "@turf/area";
import centroid from "@turf/centroid";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import type { ZoneCollections } from "@/lib/zones";

export type ZoneLabelProperties = {
  label: string;
  zoneKey: string;
  layer: "paid" | "permit";
  textColor: string;
  labelId: string;
  /** Drives label size in layout (feature-state is paint-only in MapLibre). */
  emphasized: boolean;
};

/** Must match glyphs available on OpenFreeMap / Liberty style. */
export const ZONE_LABEL_FONT = ["Noto Sans Bold"] as const;

const MIN_SECONDARY_PART_M2 = 10_000;
const MIN_SECONDARY_AREA_RATIO = 0.15;

export function activeZoneLabelKey(
  kind: "paid" | "permit" | "outside",
  zoneRaw: string | null,
): string | null {
  if (kind === "outside" || !zoneRaw?.trim()) return null;
  return `${kind}:${zoneRaw.trim().toUpperCase()}`;
}

function explodeToPolygons(
  feature: Feature<Polygon | MultiPolygon>,
): Feature<Polygon>[] {
  if (feature.geometry.type === "Polygon") {
    return [feature as Feature<Polygon>];
  }
  const baseId = String(
    feature.id ?? feature.properties?.GEBIED_COD ?? "part",
  );
  return feature.geometry.coordinates.map((coords, index) => ({
    type: "Feature",
    id: `${baseId}-${index}`,
    properties: feature.properties,
    geometry: { type: "Polygon", coordinates: coords },
  }));
}

/** Display text from official ZONE field (e.g. 1B). */
export function zoneMapLabel(
  zoneRaw: string | null | undefined,
  layer: "paid" | "permit",
): string {
  const raw = zoneRaw?.trim();
  if (raw) return raw;
  if (layer === "permit") return "Vg";
  return "";
}

function zoneKey(zoneRaw: string | undefined, layer: "paid" | "permit"): string {
  return `${layer}:${(zoneRaw ?? "").trim().toUpperCase()}`;
}

function labelTextColor(layer: "paid" | "permit", label: string): string {
  if (layer === "permit") return "#9bb8e8";
  if (label === "1" || label === "1B") return "#d48996";
  return "#c9a066";
}

/** One large label per municipal zone polygon (centroid), not merged across features. */
export function buildZoneLabelPoints(
  zones: ZoneCollections,
): FeatureCollection<Point, ZoneLabelProperties> {
  const features: Feature<Point, ZoneLabelProperties>[] = [];
  let numericId = 0;

  for (const layer of ["paid", "permit"] as const) {
    for (const feature of zones[layer].features) {
      const label = zoneMapLabel(feature.properties?.ZONE, layer);
      if (!label) continue;

      const key = zoneKey(feature.properties?.ZONE, layer);
      const textColor = labelTextColor(layer, label);
      const baseId = String(
        feature.properties?.GEBIED_COD ?? feature.id ?? numericId,
      );

      const parts = explodeToPolygons(feature).sort(
        (a, b) => area(b) - area(a),
      );
      const primary = parts[0];
      if (!primary) continue;

      const pushLabel = (part: Feature<Polygon>, suffix: string) => {
        const labelId = `${baseId}-${suffix}`;
        features.push({
          type: "Feature",
          id: numericId++,
          properties: {
            label,
            zoneKey: key,
            layer,
            textColor,
            labelId,
            emphasized: false,
          },
          geometry: {
            type: "Point",
            coordinates: centroid(part).geometry.coordinates,
          },
        });
      };

      pushLabel(primary, "0");
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (
          area(part) >=
          Math.max(area(primary) * MIN_SECONDARY_AREA_RATIO, MIN_SECONDARY_PART_M2)
        ) {
          pushLabel(part, String(i));
        }
      }
    }
  }

  return { type: "FeatureCollection", features };
}
