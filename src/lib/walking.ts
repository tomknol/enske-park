import distance from "@turf/distance";
import { point } from "@turf/helpers";

export function walkingSummary(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
): string {
  const km = distance(point([fromLon, fromLat]), point([toLon, toLat]), { units: "kilometers" });
  const minutes = Math.max(1, Math.round((km / 4.8) * 60));
  if (km < 1) {
    return `ca. ${Math.round(km * 1000)} m · ${minutes} min lopen naar Oude Markt`;
  }
  return `ca. ${km.toFixed(1).replace(".", ",")} km · ${minutes} min lopen naar Oude Markt`;
}
