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
export const ZONE_FILL_CURRENT_HOVER = 0.39;
/** Neighbor paid zones when GPS zone is known. */
export const ZONE_FILL_DIMMED = 0.11;
/** Desktop hover — same delta on every paid zone, including 1 / 1B. */
export const ZONE_FILL_HOVER = 0.26;
export const ZONE_FILL_SELECTED = 0.23;
export const ZONE_FILL_SELECTED_HOVER = 0.31;

/** Permit overlays stay quiet — current permit slightly clearer. */
export const PERMIT_FILL_BASE = 0.09;
export const PERMIT_FILL_CURRENT = 0.2;
export const PERMIT_FILL_CURRENT_HOVER = 0.26;
export const PERMIT_FILL_DIMMED = 0.06;
export const PERMIT_FILL_HOVER = 0.15;
export const PERMIT_FILL_SELECTED = 0.11;
export const PERMIT_FILL_SELECTED_HOVER = 0.17;

/** Persistent identity + temporary hover can both apply. */
function composeHoverPaint(
  currentHover: number,
  current: number,
  selectedHover: number,
  selected: number,
  hover: number,
  dimmed: number,
  base: number,
): ExpressionSpecification {
  return [
    "case",
    [
      "all",
      ["boolean", ["feature-state", "current"], false],
      ["boolean", ["feature-state", "hover"], false],
    ],
    currentHover,
    ["boolean", ["feature-state", "current"], false],
    current,
    [
      "all",
      ["boolean", ["feature-state", "selected"], false],
      ["boolean", ["feature-state", "hover"], false],
    ],
    selectedHover,
    ["boolean", ["feature-state", "selected"], false],
    selected,
    ["boolean", ["feature-state", "hover"], false],
    hover,
    ["boolean", ["feature-state", "dimOthers"], false],
    dimmed,
    base,
  ];
}

export const PERMIT_FILL_OPACITY: ExpressionSpecification = composeHoverPaint(
  PERMIT_FILL_CURRENT_HOVER,
  PERMIT_FILL_CURRENT,
  PERMIT_FILL_SELECTED_HOVER,
  PERMIT_FILL_SELECTED,
  PERMIT_FILL_HOVER,
  PERMIT_FILL_DIMMED,
  PERMIT_FILL_BASE,
);

export const ZONE_FILL_OPACITY: ExpressionSpecification = composeHoverPaint(
  ZONE_FILL_CURRENT_HOVER,
  ZONE_FILL_CURRENT,
  ZONE_FILL_SELECTED_HOVER,
  ZONE_FILL_SELECTED,
  ZONE_FILL_HOVER,
  ZONE_FILL_DIMMED,
  ZONE_FILL_BASE,
);

export const ZONE_LINE_WIDTH: ExpressionSpecification = composeHoverPaint(
  2.5,
  2,
  1.55,
  1.25,
  1.3,
  0.85,
  0.85,
);

export const ZONE_LINE_OPACITY: ExpressionSpecification = composeHoverPaint(
  0.94,
  0.82,
  0.58,
  0.38,
  0.7,
  0.48,
  0.48,
);

export const PERMIT_LINE_WIDTH: ExpressionSpecification = composeHoverPaint(
  1.85,
  1.5,
  1.05,
  0.85,
  0.9,
  0.55,
  0.55,
);

export const PERMIT_LINE_OPACITY: ExpressionSpecification = composeHoverPaint(
  0.68,
  0.55,
  0.46,
  0.34,
  0.46,
  0.28,
  0.28,
);

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
  const isHover = hoveredZoneKey != null && zoneKey === hoveredZoneKey;
  const dimOthers = currentKey != null && !isCurrent && !isHover;
  return {
    current: isCurrent,
    dimOthers,
    selected: isSelected,
    hover: isHover,
  };
}
