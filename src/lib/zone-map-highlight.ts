import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { zoneCollectionKey } from "@/lib/zone-labels";
import { zoneFillColor, zoneLineColor, type ZoneCollections } from "@/lib/zones";

export type ZoneSourceId = "paid-zones" | "permit-zones";

export type ZoneStateTarget = {
  sourceId: ZoneSourceId;
  stateId: string;
  zoneKey: string;
};

/** Baseline fill when no GPS zone is known (paid). */
export const ZONE_FILL_BASE = 0.17;
/** Current zone — richer but restrained. */
export const ZONE_FILL_CURRENT = 0.3;
/** Neighbor paid zones when GPS zone is known. */
export const ZONE_FILL_DIMMED = 0.11;
/** Desktop hover — between base and current; ignored when current/selected. */
export const ZONE_FILL_HOVER = 0.23;

/** Permit overlays stay quiet — current permit slightly clearer. */
export const PERMIT_FILL_BASE = 0.09;
export const PERMIT_FILL_CURRENT = 0.2;
export const PERMIT_FILL_DIMMED = 0.06;
export const PERMIT_FILL_HOVER = 0.13;

export const PERMIT_FILL_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  PERMIT_FILL_CURRENT,
  ["boolean", ["feature-state", "selected"], false],
  PERMIT_FILL_BASE,
  ["boolean", ["feature-state", "hover"], false],
  PERMIT_FILL_HOVER,
  ["boolean", ["feature-state", "dimOthers"], false],
  PERMIT_FILL_DIMMED,
  PERMIT_FILL_BASE,
];

export const ZONE_FILL_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  ZONE_FILL_CURRENT,
  ["boolean", ["feature-state", "selected"], false],
  ZONE_FILL_HOVER,
  ["boolean", ["feature-state", "hover"], false],
  ZONE_FILL_HOVER,
  ["boolean", ["feature-state", "dimOthers"], false],
  ZONE_FILL_DIMMED,
  ZONE_FILL_BASE,
];

export const ZONE_LINE_WIDTH: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  2,
  ["boolean", ["feature-state", "selected"], false],
  1.25,
  ["boolean", ["feature-state", "hover"], false],
  1.15,
  0.85,
];

export const ZONE_LINE_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  0.82,
  ["boolean", ["feature-state", "selected"], false],
  0.38,
  ["boolean", ["feature-state", "hover"], false],
  0.62,
  0.48,
];

export const PERMIT_LINE_WIDTH: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  1.5,
  ["boolean", ["feature-state", "selected"], false],
  0.85,
  ["boolean", ["feature-state", "hover"], false],
  0.75,
  0.55,
];

export const PERMIT_LINE_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "current"], false],
  0.55,
  ["boolean", ["feature-state", "selected"], false],
  0.34,
  ["boolean", ["feature-state", "hover"], false],
  0.4,
  0.28,
];

export const ZONE_PAINT_TRANSITION = { duration: 320, delay: 0 };
export const ZONE_HOVER_TRANSITION = { duration: 150, delay: 0 };

export function enrichZoneCollections(zones: ZoneCollections): {
  paid: FeatureCollection;
  permit: FeatureCollection;
  stateTargets: ZoneStateTarget[];
} {
  const stateTargets: ZoneStateTarget[] = [];

  const mapLayer = (
    collection: ZoneCollections["paid"],
    layer: "paid" | "permit",
    sourceId: ZoneSourceId,
  ): FeatureCollection => ({
    type: "FeatureCollection",
    features: collection.features.map((f, index) => {
      const zoneRaw = f.properties?.ZONE ?? null;
      const stateId = String(
        f.properties?.GEBIED_COD ?? f.id ?? `${sourceId}-${index}`,
      );
      stateTargets.push({
        sourceId,
        stateId,
        zoneKey: zoneCollectionKey(layer, zoneRaw),
      });
      return {
        ...f,
        properties: {
          ...f.properties,
          stateId,
          zoneKey: zoneCollectionKey(layer, zoneRaw),
          fill: zoneFillColor(zoneRaw, layer),
          line: zoneLineColor(zoneRaw, layer),
        },
      };
    }),
  });

  return {
    paid: mapLayer(zones.paid, "paid", "paid-zones"),
    permit: mapLayer(zones.permit, "permit", "permit-zones"),
    stateTargets,
  };
}

export type ZoneFeatureState = {
  current: boolean;
  dimOthers: boolean;
  selected: boolean;
  hover: boolean;
};

export function computeZoneFeatureState(
  zoneKey: string,
  currentKey: string | null,
  selectedKey: string | null,
  hoveredZoneKey: string | null,
): ZoneFeatureState {
  const isCurrent = currentKey != null && zoneKey === currentKey;
  const isSelected =
    selectedKey != null && zoneKey === selectedKey && !isCurrent;
  const isHover =
    hoveredZoneKey != null &&
    zoneKey === hoveredZoneKey &&
    !isCurrent &&
    !isSelected;
  const dimOthers = currentKey != null && !isCurrent && !isHover;
  return {
    current: isCurrent,
    dimOthers,
    selected: isSelected,
    hover: isHover,
  };
}
