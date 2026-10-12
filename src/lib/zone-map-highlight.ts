import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { zoneCollectionKey } from "@/lib/zone-labels";
import {
  isCentrePaidZone,
  zoneFillColor,
  zoneLineActiveColor,
  zoneLineColor,
  type ZoneCollections,
} from "@/lib/zones";

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
/**
 * Zone 1 / 1B use the same emphasis steps, but a quieter rest.
 * The burgundy reads hotter than amber at the shared base opacity.
 */
export const CENTRE_FILL_BASE = 0.1;
export const CENTRE_FILL_DIMMED = 0.065;
export const CENTRE_LINE_OPACITY_REST = 0.4;

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

function composeCentreRestPaint(
  currentHover: number,
  current: number,
  selectedHover: number,
  selected: number,
  hover: number,
  dimmed: number,
  base: number,
  centreDimmed: number,
  centreBase: number,
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
    [
      "all",
      ["==", ["get", "centre"], true],
      ["boolean", ["feature-state", "dimOthers"], false],
    ],
    centreDimmed,
    ["boolean", ["feature-state", "dimOthers"], false],
    dimmed,
    ["==", ["get", "centre"], true],
    centreBase,
    base,
  ];
}

export const ZONE_FILL_OPACITY: ExpressionSpecification = composeCentreRestPaint(
  ZONE_FILL_CURRENT_HOVER,
  ZONE_FILL_CURRENT,
  ZONE_FILL_SELECTED_HOVER,
  ZONE_FILL_SELECTED,
  ZONE_FILL_HOVER,
  ZONE_FILL_DIMMED,
  ZONE_FILL_BASE,
  CENTRE_FILL_DIMMED,
  CENTRE_FILL_BASE,
);

/** Selected is the strongest stroke, including when the zone is also the GPS zone. */
export const ZONE_LINE_WIDTH_SELECTED = 3.5;
export const ZONE_LINE_WIDTH_CURRENT_HOVER = 2.5;
export const ZONE_LINE_WIDTH_CURRENT = 2.25;
export const ZONE_LINE_WIDTH_HOVER = 2;
export const ZONE_LINE_WIDTH_BASE = 1.2;

export const PERMIT_LINE_WIDTH_SELECTED = 2.4;
export const PERMIT_LINE_WIDTH_CURRENT = 1.6;
export const PERMIT_LINE_WIDTH_HOVER = 1.25;
export const PERMIT_LINE_WIDTH_BASE = 0.7;

export function zoneLineWidthForState(
  state: { current: boolean; selected: boolean; hover: boolean },
  permit = false,
): number {
  if (state.selected) return permit ? PERMIT_LINE_WIDTH_SELECTED : ZONE_LINE_WIDTH_SELECTED;
  if (state.current && state.hover) {
    return permit ? 1.85 : ZONE_LINE_WIDTH_CURRENT_HOVER;
  }
  if (state.current) return permit ? PERMIT_LINE_WIDTH_CURRENT : ZONE_LINE_WIDTH_CURRENT;
  if (state.hover) return permit ? PERMIT_LINE_WIDTH_HOVER : ZONE_LINE_WIDTH_HOVER;
  return permit ? PERMIT_LINE_WIDTH_BASE : ZONE_LINE_WIDTH_BASE;
}

function composeLineWidth(
  selected: number,
  currentHover: number,
  current: number,
  hover: number,
  base: number,
): ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    selected,
    [
      "all",
      ["boolean", ["feature-state", "current"], false],
      ["boolean", ["feature-state", "hover"], false],
    ],
    currentHover,
    ["boolean", ["feature-state", "current"], false],
    current,
    ["boolean", ["feature-state", "hover"], false],
    hover,
    base,
  ];
}

export const ZONE_LINE_WIDTH: ExpressionSpecification = composeLineWidth(
  ZONE_LINE_WIDTH_SELECTED,
  ZONE_LINE_WIDTH_CURRENT_HOVER,
  ZONE_LINE_WIDTH_CURRENT,
  ZONE_LINE_WIDTH_HOVER,
  ZONE_LINE_WIDTH_BASE,
);

export const ZONE_LINE_OPACITY: ExpressionSpecification = [
  "case",
  [
    "all",
    ["boolean", ["feature-state", "selected"], false],
    ["boolean", ["feature-state", "hover"], false],
  ],
  0.96,
  ["boolean", ["feature-state", "selected"], false],
  0.9,
  [
    "all",
    ["boolean", ["feature-state", "current"], false],
    ["boolean", ["feature-state", "hover"], false],
  ],
  0.94,
  ["boolean", ["feature-state", "current"], false],
  0.82,
  ["boolean", ["feature-state", "hover"], false],
  0.7,
  [
    "all",
    ["==", ["get", "centre"], true],
    ["boolean", ["feature-state", "dimOthers"], false],
  ],
  CENTRE_LINE_OPACITY_REST,
  ["boolean", ["feature-state", "dimOthers"], false],
  0.48,
  ["==", ["get", "centre"], true],
  CENTRE_LINE_OPACITY_REST,
  0.48,
];

export const PERMIT_LINE_WIDTH: ExpressionSpecification = composeLineWidth(
  PERMIT_LINE_WIDTH_SELECTED,
  1.85,
  PERMIT_LINE_WIDTH_CURRENT,
  PERMIT_LINE_WIDTH_HOVER,
  PERMIT_LINE_WIDTH_BASE,
);

export const PERMIT_LINE_OPACITY: ExpressionSpecification = [
  "case",
  [
    "all",
    ["boolean", ["feature-state", "selected"], false],
    ["boolean", ["feature-state", "hover"], false],
  ],
  0.82,
  ["boolean", ["feature-state", "selected"], false],
  0.74,
  [
    "all",
    ["boolean", ["feature-state", "current"], false],
    ["boolean", ["feature-state", "hover"], false],
  ],
  0.68,
  ["boolean", ["feature-state", "current"], false],
  0.55,
  ["boolean", ["feature-state", "hover"], false],
  0.46,
  ["boolean", ["feature-state", "dimOthers"], false],
  0.28,
  0.28,
];

/** Zone paint shares one duration. MapLibre interpolates linearly. */
export const ZONE_PAINT_TRANSITION = { duration: 200, delay: 0 };
export const ZONE_HOVER_TRANSITION = ZONE_PAINT_TRANSITION;

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
          lineActive: zoneLineActiveColor(zoneRaw, layer),
          centre: layer === "paid" && isCentrePaidZone(zoneRaw),
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
  const isSelected = selectedKey != null && zoneKey === selectedKey;
  const isHover = hoveredZoneKey != null && zoneKey === hoveredZoneKey;
  const dimOthers = currentKey != null && !isCurrent && !isHover && !isSelected;
  return {
    current: isCurrent,
    dimOthers,
    selected: isSelected,
    hover: isHover,
  };
}
