export type OverlayActivation =
  | { kind: "garage"; id?: string }
  | { kind: "stadserf-access"; id: string };

export type ZoneActivation = {
  layerId: string;
  zoneRaw: string | null;
  gebiedCod: string | null;
};

export type MapActivation =
  | { type: "garage"; id?: string }
  | { type: "stadserf-access"; id: string }
  | { type: "stadserf" }
  | {
      type: "zone";
      layerId: string;
      zoneRaw: string | null;
      gebiedCod: string | null;
    }
  | { type: "background" };

/**
 * Click/tap priority: overlay markers, then Stadserf openings, then Stadserf
 * fill (over Zone 1), then zones.
 */
export function resolveMapActivation(
  overlay: OverlayActivation | null,
  stadserfHit: boolean,
  zone: ZoneActivation | null,
): MapActivation {
  if (overlay?.kind === "garage") return { type: "garage", id: overlay.id };
  if (overlay?.kind === "stadserf-access") {
    return { type: "stadserf-access", id: overlay.id };
  }
  if (stadserfHit) return { type: "stadserf" };
  if (zone) {
    return {
      type: "zone",
      layerId: zone.layerId,
      zoneRaw: zone.zoneRaw,
      gebiedCod: zone.gebiedCod,
    };
  }
  return { type: "background" };
}
