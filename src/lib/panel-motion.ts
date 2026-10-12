import type { HoveredMapFeature } from "@/lib/panel-context";

/** Stable id for a hover preview. Counts and countdown seconds are excluded. */
export function hoverMotionId(hover: HoveredMapFeature | null): string | null {
  if (!hover) return null;
  if (hover.kind === "outside") return "outside";
  if (hover.kind === "garage") return `garage:${hover.garage.id}`;
  if (hover.kind === "stadserf-access") return `access:${hover.id}`;
  if (hover.kind === "stadserf") return "stadserf";
  return `${hover.kind}:${hover.zoneRaw ?? ""}`;
}

/** Identity of panel content that should crossfade. Countdown seconds are excluded. */
export function panelMotionKey(parts: {
  error: boolean;
  hover: string | null;
  context: string | null;
  paid: boolean | null;
  accessOpen: boolean | null;
  geo: string;
}): string {
  return [
    parts.error ? "error" : "ok",
    parts.hover ?? "",
    parts.context ?? "",
    parts.paid == null ? "" : parts.paid ? "paid" : "free",
    parts.accessOpen == null ? "" : parts.accessOpen ? "open" : "closed",
    parts.geo,
  ].join("|");
}
