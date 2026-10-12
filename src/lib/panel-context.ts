import type { GarageMarkerData } from "@/lib/garages";
import { zoneCollectionKey } from "@/lib/zone-labels";

/** Single map/panel focus — only one contextual mode besides transient desktop hover. */
export type MapPanelContext =
  | { type: "live" }
  | { type: "info" }
  | {
      type: "zone";
      kind: "paid" | "permit";
      zoneRaw: string | null;
      lon?: number;
      lat?: number;
    }
  | { type: "garage"; garage: GarageMarkerData }
  | {
      type: "destination";
      label: string;
      lon: number;
      lat: number;
      kind: "paid" | "permit" | "outside";
      zoneRaw: string | null;
    }
  | {
      type: "point";
      lon: number;
      lat: number;
      kind: "paid" | "permit" | "outside";
      zoneRaw: string | null;
    }
  | { type: "stadserf" }
  | { type: "stadserf-access"; id: string };

export type HoveredMapFeature =
  | { kind: "paid" | "permit"; zoneRaw: string | null }
  | { kind: "outside" }
  | { kind: "stadserf" }
  | { kind: "garage"; garage: GarageMarkerData }
  | { kind: "stadserf-access"; id: string };

export function isLiveContext(ctx: MapPanelContext | null): boolean {
  return ctx == null || ctx.type === "live";
}

/**
 * Hover previews the panel only when nothing is explicitly selected.
 * A selection stays in the panel until the user changes or clears it.
 */
export function hoverReplacesContext(
  hover: HoveredMapFeature | null,
  context: MapPanelContext | null,
): hover is HoveredMapFeature {
  return hover != null && isLiveContext(context);
}

/** True when this click is the zone that is already explicitly selected. */
export function isSameSelectedZone(
  context: MapPanelContext | null,
  kind: "paid" | "permit",
  zoneRaw: string | null,
): boolean {
  if (context?.type !== "zone") return false;
  return (
    zoneCollectionKey(context.kind, context.zoneRaw) ===
    zoneCollectionKey(kind, zoneRaw)
  );
}
