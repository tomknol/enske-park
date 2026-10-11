import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import buffer from "@turf/buffer";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { normalizeZoneId } from "@/lib/tariffs";

export type ZoneFeatureProps = {
  ZONE?: string;
  GEBIED_COD?: string;
  layer: "paid" | "permit";
};

export type ZoneCollections = {
  paid: FeatureCollection<Polygon | MultiPolygon, ZoneFeatureProps>;
  permit: FeatureCollection<Polygon | MultiPolygon, ZoneFeatureProps>;
};

export type UserZoneMatch = {
  kind: "paid" | "permit" | "outside";
  zoneRaw: string | null;
  featureId: string | number | null;
  nearBoundary: boolean;
};

function featureKey(f: Feature, index: number): string | number {
  return f.id ?? f.properties?.GEBIED_COD ?? index;
}

export function locateUserInZones(
  lon: number,
  lat: number,
  accuracyMeters: number | null,
  collections: ZoneCollections | null,
): UserZoneMatch {
  if (!collections) {
    return { kind: "outside", zoneRaw: null, featureId: null, nearBoundary: false };
  }

  const pt = point([lon, lat]);
  let paidHit: Feature | null = null;
  let paidKey: string | number | null = null;

  collections.paid.features.forEach((f, i) => {
    if (booleanPointInPolygon(pt, f)) {
      paidHit = f;
      paidKey = featureKey(f, i);
    }
  });

  if (paidHit) {
    const zoneRaw = (paidHit as Feature).properties?.ZONE ?? null;
    return {
      kind: "paid",
      zoneRaw,
      featureId: paidKey,
      nearBoundary: isNearBoundary(pt, accuracyMeters, collections, "paid", paidKey),
    };
  }

  let permitHit: Feature | null = null;
  let permitKey: string | number | null = null;
  collections.permit.features.forEach((f, i) => {
    if (booleanPointInPolygon(pt, f)) {
      permitHit = f;
      permitKey = featureKey(f, i);
    }
  });

  if (permitHit) {
    return {
      kind: "permit",
      zoneRaw: (permitHit as Feature).properties?.ZONE ?? null,
      featureId: permitKey,
      nearBoundary: isNearBoundary(pt, accuracyMeters, collections, "permit", permitKey),
    };
  }

  return {
    kind: "outside",
    zoneRaw: null,
    featureId: null,
    nearBoundary: isNearAnyBoundary(pt, accuracyMeters, collections),
  };
}

function isNearBoundary(
  pt: ReturnType<typeof point>,
  accuracyMeters: number | null,
  collections: ZoneCollections,
  layer: "paid" | "permit",
  activeKey: string | number | null,
): boolean {
  const radius = Math.max(accuracyMeters ?? 15, 12);
  const circle = buffer(pt, radius, { units: "meters", steps: 16 });
  if (!circle) return false;

  const features =
    layer === "paid" ? collections.paid.features : collections.permit.features;

  const overlapping = new Set<string | number>();
  features.forEach((f, i) => {
    if (booleanPointInPolygon(pt, f)) overlapping.add(featureKey(f, i));
  });

  const ring = circle.geometry.coordinates[0] as [number, number][] | undefined;
  ring?.forEach((coord) => {
    const edge = point(coord as [number, number]);
    features.forEach((f, i) => {
      if (booleanPointInPolygon(edge, f)) overlapping.add(featureKey(f, i));
    });
    const other =
      layer === "paid" ? collections.permit.features : collections.paid.features;
    other.forEach((f, i) => {
      if (booleanPointInPolygon(edge, f)) overlapping.add(`x-${featureKey(f, i)}`);
    });
  });

  if (overlapping.size > 1) return true;
  if (activeKey != null && overlapping.size === 1 && !overlapping.has(activeKey)) return true;
  return radius >= 25;
}

function isNearAnyBoundary(
  pt: ReturnType<typeof point>,
  accuracyMeters: number | null,
  collections: ZoneCollections,
): boolean {
  const radius = Math.max(accuracyMeters ?? 15, 12);
  const circle = buffer(pt, radius, { units: "meters", steps: 12 });
  if (!circle) return false;
  let hits = 0;
  for (const f of [...collections.paid.features, ...collections.permit.features]) {
    if (booleanPointInPolygon(pt, f)) hits++;
  }
  if (hits > 0) return true;
  const ring = circle.geometry.coordinates[0] as [number, number][] | undefined;
  for (const coord of ring ?? []) {
    const edge = point(coord as [number, number]);
    for (const f of [...collections.paid.features, ...collections.permit.features]) {
      if (booleanPointInPolygon(edge, f)) return true;
    }
  }
  return false;
}

export function zoneDisplayName(zoneRaw: string | null): string {
  const z = normalizeZoneId(zoneRaw);
  if (!z) return "Zone";
  return z === "1B" ? "Zone 1B" : `Zone ${z}`;
}

export function zoneFillColor(zoneRaw: string | null, layer: "paid" | "permit"): string {
  if (layer === "permit") return "rgba(37, 99, 235, 0.22)";
  const z = normalizeZoneId(zoneRaw);
  if (z === "1" || z === "1B") return "rgba(220, 38, 38, 0.28)";
  return "rgba(245, 158, 11, 0.26)";
}

export function zoneLineColor(zoneRaw: string | null, layer: "paid" | "permit"): string {
  if (layer === "permit") return "rgba(29, 78, 216, 0.85)";
  const z = normalizeZoneId(zoneRaw);
  if (z === "1" || z === "1B") return "rgba(185, 28, 28, 0.9)";
  return "rgba(217, 119, 6, 0.85)";
}
