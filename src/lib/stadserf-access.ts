import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import type { Feature, FeatureCollection, Point } from "geojson";
import { stadserfAccessPointsData } from "@/data/stadserf-access-points-data";
import { stadserfPolygonFeature } from "@/lib/stadserf";

export type StadserfAccessDirection = "entry" | "exit" | "both";

export type StadserfAccessPoint = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  direction: StadserfAccessDirection;
  source: string;
};

export const STADSERF_ACCESS_SOURCE = "stadserf-access";
export const STADSERF_ACCESS_HIT_LAYER = "stadserf-access-hit";
export const STADSERF_ACCESS_FILL_LAYER = "stadserf-access-fill";
export const STADSERF_ACCESS_ICON_LAYER = "stadserf-access-icon";
export const STADSERF_ACCESS_LABEL_LAYER = "stadserf-access-label";

/** Street names appear only when zoomed in. The marker itself stays visible. */
export const STADSERF_ACCESS_LABEL_MIN_ZOOM = 16.25;

export const STADSERF_ACCESS_ICON = {
  entry: "stadserf-access-entry",
  exit: "stadserf-access-exit",
  both: "stadserf-access-both",
} as const;

export function stadserfAccessPoints(): readonly StadserfAccessPoint[] {
  return stadserfAccessPointsData;
}

export function getStadserfAccessPoint(id: string): StadserfAccessPoint | undefined {
  return stadserfAccessPointsData.find((point) => point.id === id);
}

export function stadserfAccessDirectionLabel(
  direction: StadserfAccessDirection,
): string {
  if (direction === "entry") return "Alleen ingang";
  if (direction === "exit") return "Alleen uitgang";
  return "In- en uitgang";
}

/** Compact hover column. The selected panel keeps the full sentence. */
export function stadserfAccessHoverDirection(
  direction: StadserfAccessDirection,
): string {
  if (direction === "entry") return "IN";
  if (direction === "exit") return "UIT";
  return "IN / UIT";
}

export function stadserfAccessIconName(direction: StadserfAccessDirection): string {
  return STADSERF_ACCESS_ICON[direction];
}

export function distanceToStadserfRingMeters(lon: number, lat: number): number {
  const ring = lineString(stadserfPolygonFeature().geometry.coordinates[0]);
  const origin = point([lon, lat]);
  const snapped = nearestPointOnLine(ring, origin);
  return distance(origin, snapped, { units: "meters" });
}

export function buildStadserfAccessCollection(
  points: readonly StadserfAccessPoint[] = stadserfAccessPointsData,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: points.map((access) => {
      const feature: Feature<Point> = {
        type: "Feature",
        id: access.id,
        geometry: {
          type: "Point",
          coordinates: [access.lon, access.lat],
        },
        properties: {
          kind: "stadserf-access",
          id: access.id,
          name: access.name,
          direction: access.direction,
          icon: stadserfAccessIconName(access.direction),
          ariaLabel: `Toegang Stadserf, ${access.name}, ${stadserfAccessDirectionLabel(access.direction)}`,
        },
      };
      return feature;
    }),
  };
}

const ICON_SIZE = 56;

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: 1 | -1,
) {
  const tip = cx + dir * 12;
  const tail = cx - dir * 2.5;
  ctx.beginPath();
  ctx.moveTo(tail, cy);
  ctx.lineTo(tip, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip - dir * 6.5, cy - 5.5);
  ctx.lineTo(tip, cy);
  ctx.lineTo(tip - dir * 6.5, cy + 5.5);
  ctx.stroke();
}

function drawGate(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x, y + h);
  ctx.stroke();
}

export function createStadserfAccessIconImageData(
  direction: StadserfAccessDirection,
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Stadserf access icon canvas is unavailable");
  }

  ctx.strokeStyle = "#d4a3de";
  ctx.lineWidth = 2.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  if (direction === "both") {
    drawArrow(ctx, cx - 8, cy, -1);
    drawArrow(ctx, cx + 8, cy, 1);
  } else if (direction === "entry") {
    drawArrow(ctx, cx - 4, cy, 1);
    ctx.lineWidth = 2.4;
    drawGate(ctx, cx + 13, cy, 10);
  } else {
    ctx.lineWidth = 2.4;
    drawGate(ctx, cx - 13, cy, 10);
    ctx.lineWidth = 2.7;
    drawArrow(ctx, cx + 4, cy, 1);
  }

  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}
