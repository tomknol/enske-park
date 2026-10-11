import type { GarageMarkerData } from "@/lib/garages";

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
  | { type: "pnr" }
  | {
      type: "destination";
      label: string;
      lon: number;
      lat: number;
      kind: "paid" | "permit" | "outside";
      zoneRaw: string | null;
    };

export function isLiveContext(ctx: MapPanelContext | null): boolean {
  return ctx == null || ctx.type === "live";
}
