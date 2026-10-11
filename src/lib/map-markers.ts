import {
  formatGarageMarkerLabel,
  type GarageMarkerData,
  type GarageOccupancyLevel,
} from "@/lib/garages";

export const GARAGE_COUNT_MIN_ZOOM = 14.5;

export function syncGarageMarkerAppearance(
  el: HTMLButtonElement,
  g: GarageMarkerData,
  zoom: number,
) {
  const zoomedIn = zoom >= GARAGE_COUNT_MIN_ZOOM;
  const showFull = zoomedIn && g.live && g.level === "full";
  const showCount = zoomedIn && g.live && g.vacant != null && g.level !== "full";
  el.className = [
    "garage-map-marker",
    showCount || showFull ? "" : "garage-map-marker--compact",
    showFull ? "garage-map-marker--full" : "",
  ]
    .filter(Boolean)
    .join(" ");
  el.textContent = showFull ? "P VOL" : showCount ? `P ${g.vacant}` : "P";
  el.setAttribute(
    "aria-label",
    `${g.label}, ${g.live ? formatGarageMarkerLabel(g.level as GarageOccupancyLevel, g.vacant) : "Bezetting onbekend"}`,
  );
}

export function createGarageMarkerElement(g: GarageMarkerData, zoom: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  syncGarageMarkerAppearance(el, g, zoom);
  return el;
}

export function createPnrMarkerElement(): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pnr-map-marker";
  el.textContent = "P+R";
  el.setAttribute("aria-label", "P+R Zuiderval, € 3 per dag");
  return el;
}

export function createDestinationMarkerElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "map-destination-pin";
  el.setAttribute("aria-hidden", "true");
  return el;
}
