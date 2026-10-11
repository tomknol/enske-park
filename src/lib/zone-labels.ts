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
  emphasized: boolean;
  labelSelected: boolean;
  labelHover: boolean;
};

/** Must match glyphs available on OpenFreeMap / Liberty style. */
export const ZONE_LABEL_FONT = ["Noto Sans Bold"] as const;

/** Matches zoneKey on label points and polygon features (paid:4, permit:VG, …). */
export function zoneCollectionKey(
  layer: "paid" | "permit",
  zoneRaw: string | null | undefined,
): string {
  return `${layer}:${(zoneRaw ?? "").trim().toUpperCase()}`;
}

export function activeZoneLabelKey(
  kind: "paid" | "permit" | "outside",
  zoneRaw: string | null,
): string | null {
  if (kind === "outside" || !zoneRaw?.trim()) return null;
  return zoneCollectionKey(kind, zoneRaw);
}

export function parseZoneCollectionKey(
  key: string,
): { kind: "paid" | "permit"; zoneRaw: string } | null {
  const colon = key.indexOf(":");
  if (colon <= 0) return null;
  const layer = key.slice(0, colon);
  if (layer !== "paid" && layer !== "permit") return null;
  return { kind: layer, zoneRaw: key.slice(colon + 1) };
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

function zoneKey(zoneRaw: string | undefined, layer: "paid" | "permit"): string {
  return zoneCollectionKey(layer, zoneRaw);
}

function labelTextColor(layer: "paid" | "permit", label: string): string {
  if (layer === "permit") return "#8fa3bc";
  if (label === "1" || label === "1B") return "#c47886";
  return "#b8925c";
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

function buildPaidZoneLabels(
  zones: ZoneCollections,
  numericIdStart: number,
): { features: Feature<Point, ZoneLabelProperties>[]; nextId: number } {
  const features: Feature<Point, ZoneLabelProperties>[] = [];
  let numericId = numericIdStart;

  for (const feature of zones.paid.features) {
    const label = zoneMapLabel(feature.properties?.ZONE, "paid");
    if (!label) continue;

    const key = zoneKey(feature.properties?.ZONE, "paid");
    const textColor = labelTextColor("paid", label);
    const baseId = String(
      feature.properties?.GEBIED_COD ?? feature.id ?? numericId,
    );

    const parts = explodeToPolygons(feature).sort((a, b) => area(b) - area(a));
    const primary = parts[0];
    if (!primary) continue;

    features.push({
      type: "Feature",
      id: numericId++,
      properties: {
        label,
        zoneKey: key,
        layer: "paid",
        textColor,
        labelId: `${baseId}-paid-0`,
        emphasized: false,
        labelSelected: false,
        labelHover: false,
      },
      geometry: {
        type: "Point",
        coordinates: centroid(primary).geometry.coordinates,
      },
    });
  }

  return { features, nextId: numericId };
}

/** One small permit label per logical zone — largest fragment only. */
function buildPermitZoneLabels(
  zones: ZoneCollections,
  numericIdStart: number,
): { features: Feature<Point, ZoneLabelProperties>[]; nextId: number } {
  const features: Feature<Point, ZoneLabelProperties>[] = [];
  let numericId = numericIdStart;

  const largestByKey = new Map<
    string,
    { part: Feature<Polygon>; areaM2: number; zoneRaw: string | undefined }
  >();

  for (const feature of zones.permit.features) {
    const key = zoneKey(feature.properties?.ZONE, "permit");
    const parts = explodeToPolygons(feature);
    for (const part of parts) {
      const a = area(part);
      const prev = largestByKey.get(key);
      if (!prev || a > prev.areaM2) {
        largestByKey.set(key, {
          part,
          areaM2: a,
          zoneRaw: feature.properties?.ZONE,
        });
      }
    }
  }

  for (const [key, { part }] of largestByKey) {
    features.push({
      type: "Feature",
      id: numericId++,
      properties: {
        label: "Vg",
        zoneKey: key,
        layer: "permit",
        textColor: labelTextColor("permit", "Vg"),
        labelId: `permit-${key}`,
        emphasized: false,
        labelSelected: false,
        labelHover: false,
      },
      geometry: {
        type: "Point",
        coordinates: centroid(part).geometry.coordinates,
      },
    });
  }

  return { features, nextId: numericId };
}

/** Paid zone numbers (large) + at most one subtle permit label per area. */
export function buildZoneLabelPoints(
  zones: ZoneCollections,
): FeatureCollection<Point, ZoneLabelProperties> {
  const paid = buildPaidZoneLabels(zones, 0);
  const permit = buildPermitZoneLabels(zones, paid.nextId);
  return {
    type: "FeatureCollection",
    features: [...paid.features, ...permit.features],
  };
}
