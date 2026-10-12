import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { stadserfBoundaryData } from "@/data/stadserf-boundary-data";
import { formatEuro } from "@/lib/tariffs";

/**
 * Voetgangerszone / stadserf access rules — update amounts here for new years.
 * Geometry lives in `stadserf-boundary-data.ts`.
 */
export const STADSERF = {
  id: "voetgangerszone-binnenstad",
  label: "Stadserf",
  title: "Voetgangerszone binnenstad",
  accessStartHour: 7,
  accessStartMinute: 0,
  accessEndHour: 11,
  accessEndMinute: 0,
  /** Incidentele dagontheffing toegang (leges 2026). */
  dayPermitEur: 17.25,
  dayPermitValidHours: 30,
  dayPermitFromHour: 0,
  dayPermitUntilNextMorningHour: 6,
  sourceUrl: "https://www.enschede.nl/toegang-en-parkeren-binnenstad",
  applyUrl: "https://www.enschede.nl/toegang-en-parkeren-binnenstad",
  policyUrl: "https://lokaleregelgeving.overheid.nl/CVDR742062/1",
} as const;

export const STADSERF_SOURCE = "stadserf-boundary";
export const STADSERF_FILL_LAYER = "stadserf-fill";
export const STADSERF_LINE_LAYER = "stadserf-line";
export const STADSERF_FEATURE_ID = "voetgangerszone-binnenstad";

export type StadserfStatus = {
  accessOpen: boolean;
  left: string;
  center: "STADSERF";
  right: "TOEGANG" | "ONTHEFFING";
  fact: string;
  windowEndsAt: number | null;
  tone: "stadserf";
  rightMode: "access" | "exemption";
};

export function stadserfPolygonFeature(): Feature<Polygon> {
  const feature = stadserfBoundaryData.features[0];
  if (!feature || feature.geometry.type !== "Polygon") {
    throw new Error("Stadserf geometry must be a closed Polygon");
  }
  return feature;
}

export function stadserfPolygonCollection(): FeatureCollection<Polygon> {
  return stadserfBoundaryData;
}

export function isStadserfRingClosed(
  ring: Feature<Polygon>["geometry"]["coordinates"][0] = stadserfPolygonFeature()
    .geometry.coordinates[0],
): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

export function isPointInStadserf(lon: number, lat: number): boolean {
  return booleanPointInPolygon(point([lon, lat]), stadserfPolygonFeature());
}

const AMSTERDAM_TZ = "Europe/Amsterdam";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function amsterdamWallInstant(
  now: Date,
  hour: number,
  minute: number,
  second = 0,
): Date {
  const day = formatInTimeZone(now, AMSTERDAM_TZ, "yyyy-MM-dd");
  return fromZonedTime(
    `${day}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
    AMSTERDAM_TZ,
  );
}

export function isStadserfAccessOpen(now = new Date()): boolean {
  const start = amsterdamWallInstant(
    now,
    STADSERF.accessStartHour,
    STADSERF.accessStartMinute,
  );
  const end = amsterdamWallInstant(
    now,
    STADSERF.accessEndHour,
    STADSERF.accessEndMinute,
  );
  return now >= start && now < end;
}

export function stadserfWindowEndsAt(now = new Date()): Date | null {
  if (!isStadserfAccessOpen(now)) return null;
  return amsterdamWallInstant(now, STADSERF.accessEndHour, STADSERF.accessEndMinute);
}

/** Padded `HH:MM:SS` remaining (Stadserf venstertijd). */
export function formatStadserfCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatStadserfDayPermitPrice(): string {
  return `€ ${formatEuro(STADSERF.dayPermitEur)}`;
}

export function resolveStadserfStatus(now = new Date()): StadserfStatus {
  const accessOpen = isStadserfAccessOpen(now);
  const end = stadserfWindowEndsAt(now);

  if (accessOpen && end) {
    const countdown = formatStadserfCountdown(end.getTime() - now.getTime());
    return {
      accessOpen: true,
      left: `tot ${pad2(STADSERF.accessEndHour)}:${pad2(STADSERF.accessEndMinute)}`,
      center: "STADSERF",
      right: "TOEGANG",
      fact: `Nog ${countdown} venstertijd · alleen laden/lossen`,
      windowEndsAt: end.getTime(),
      tone: "stadserf",
      rightMode: "access",
    };
  }

  return {
    accessOpen: false,
    left: `vanaf ${pad2(STADSERF.accessStartHour)}:${pad2(STADSERF.accessStartMinute)}`,
    center: "STADSERF",
    right: "ONTHEFFING",
    fact: `Dagontheffing toegang ${formatStadserfDayPermitPrice()}`,
    windowEndsAt: null,
    tone: "stadserf",
    rightMode: "exemption",
  };
}

/** One secondary line for an entrance hover. Seconds are display-only. */
export function stadserfAccessHoverFact(now = new Date()): string {
  const end = stadserfWindowEndsAt(now);
  if (end) {
    const countdown = formatStadserfCountdown(end.getTime() - now.getTime());
    return `Venstertijd · nog ${countdown}`;
  }
  return `Ontheffing vereist · ${formatStadserfDayPermitPrice()} per dag`;
}

export function stadserfAccessWindowCopy(now = new Date()): {
  title: string;
  detail: string;
} {
  const accessOpen = isStadserfAccessOpen(now);
  const end = stadserfWindowEndsAt(now);
  if (accessOpen && end) {
    const countdown = formatStadserfCountdown(end.getTime() - now.getTime());
    return {
      title: "Venstertijd actief",
      detail: `Nog ${countdown} · voor laden/lossen`,
    };
  }
  return {
    title: "Ontheffing vereist",
    detail: `Dagontheffing toegang ${formatStadserfDayPermitPrice()}`,
  };
}

export function stadserfSelectedDetails(): {
  title: string;
  lines: string[];
  actionLabel: string;
  actionUrl: string;
} {
  const start = `${pad2(STADSERF.accessStartHour)}:${pad2(STADSERF.accessStartMinute)}`;
  const end = `${pad2(STADSERF.accessEndHour)}:${pad2(STADSERF.accessEndMinute)}`;
  const from = `${pad2(STADSERF.dayPermitFromHour)}:00`;
  const until = `${pad2(STADSERF.dayPermitUntilNextMorningHour)}:00`;
  return {
    title: STADSERF.title,
    lines: [
      `Zonder ontheffing: ${start}–${end} voor laden/lossen`,
      `Dagontheffing toegang: ${formatStadserfDayPermitPrice()}`,
      `Geldig van ${from} tot ${until} de volgende ochtend`,
      "Geeft geen toestemming om te parkeren",
      "Borden ter plaatse zijn leidend",
    ],
    actionLabel: "Ontheffing aanvragen →",
    actionUrl: STADSERF.applyUrl,
  };
}
