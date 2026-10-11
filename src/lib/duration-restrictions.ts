import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { durationRestrictionsData as restrictions } from "@/data/duration-restrictions-data";

export type DurationRestrictionProps = {
  id: string;
  name: string;
  maxMinutes: number;
  source?: string;
  sourceUrl?: string;
  geometryNote?: string;
};

export type DurationRestriction = {
  id: string;
  name: string;
  maxMinutes: number;
  label: string;
};

export type DurationRestrictionCollection = FeatureCollection<
  Polygon | MultiPolygon,
  DurationRestrictionProps
>;

export const DURATION_RESTRICTIONS =
  restrictions as DurationRestrictionCollection;

export function formatMaxDurationLabel(maxMinutes: number): string {
  if (maxMinutes === 30) return "MAX. 30 MIN.";
  if (maxMinutes % 60 === 0) {
    const hours = maxMinutes / 60;
    return hours === 1 ? "MAX. 1 UUR" : `MAX. ${hours} UUR`;
  }
  return `MAX. ${maxMinutes} MIN.`;
}

export function findDurationRestriction(
  lon: number,
  lat: number,
  collection: DurationRestrictionCollection = DURATION_RESTRICTIONS,
): DurationRestriction | null {
  const pt = point([lon, lat]);
  for (const f of collection.features) {
    if (booleanPointInPolygon(pt, f)) {
      const maxMinutes = f.properties.maxMinutes;
      return {
        id: f.properties.id,
        name: f.properties.name,
        maxMinutes,
        label: formatMaxDurationLabel(maxMinutes),
      };
    }
  }
  return null;
}
