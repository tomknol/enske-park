import { formatInTimeZone } from "date-fns-tz";

/** A dynamic count older than this is not shown as live. */
export const GARAGE_FRESH_MS = 5 * 60 * 1000;

export type GarageOccupancyLevel = "plenty" | "busy" | "full" | "unknown";

export type GarageMarkerData = {
  id: string;
  label: string;
  shortLabel: string;
  lat: number | null;
  lon: number | null;
  vacant: number | null;
  capacity: number | null;
  live: boolean;
  level: GarageOccupancyLevel;
  lastUpdated: number | null;
};

export function garageCountIsFresh(updatedAt: number | null, now = Date.now()): boolean {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = now - updatedAt;
  return age >= -60_000 && age <= GARAGE_FRESH_MS;
}

export function occupancyLevel(
  vacant: number | null,
  capacity: number | null,
  full: boolean | null,
): GarageOccupancyLevel {
  if (vacant === 0 || (full === true && vacant == null)) return "full";
  if (vacant == null || capacity == null || capacity <= 0 || vacant > capacity) return "unknown";
  if (vacant / capacity <= 0.25) return "busy";
  return "plenty";
}

/** Marker text. The number is free spaces, and only when that count is live. */
export function garageMarkerText(freeSpaces: number | null, live: boolean): string {
  if (!live || freeSpaces == null) return "P";
  if (freeSpaces === 0) return "P VOL";
  return `P ${freeSpaces}`;
}

export function formatGarageMarkerLabel(
  level: GarageOccupancyLevel,
  vacant: number | null,
): string {
  return garageMarkerText(vacant, level !== "unknown");
}

export function presentGarageOccupancy(
  garage: GarageMarkerData,
  now = Date.now(),
): GarageMarkerData {
  const countIsUsable =
    garage.live &&
    garage.vacant != null &&
    Number.isInteger(garage.vacant) &&
    garage.vacant >= 0 &&
    garageCountIsFresh(garage.lastUpdated, now) &&
    (garage.capacity == null || garage.vacant <= garage.capacity);

  if (!countIsUsable) {
    return { ...garage, vacant: null, live: false, level: "unknown" };
  }

  return {
    ...garage,
    live: true,
    level: occupancyLevel(garage.vacant, garage.capacity, garage.vacant === 0),
  };
}

export function clearGarageLive(garage: GarageMarkerData): GarageMarkerData {
  return { ...garage, vacant: null, live: false, level: "unknown" };
}

function readApiNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readApiInt(value: unknown): number | null {
  const n = readApiNumber(value);
  if (n == null || !Number.isInteger(n)) return null;
  return n;
}

/** Accepts the `/api/garages` record and drops any count that is no longer fresh. */
export function garageFromApi(raw: unknown, now = Date.now()): GarageMarkerData | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const label =
    typeof row.label === "string"
      ? row.label
      : typeof row.name === "string"
        ? row.name
        : null;
  const shortLabel = typeof row.shortLabel === "string" ? row.shortLabel : null;
  if (!id || !label || !shortLabel) return null;

  const lat = readApiNumber(row.latitude ?? row.lat);
  const lon = readApiNumber(row.longitude ?? row.lon);

  return presentGarageOccupancy(
    {
      id,
      label,
      shortLabel,
      lat,
      lon,
      vacant: readApiInt(row.freeSpaces ?? row.vacant),
      capacity: readApiInt(row.capacity),
      live: row.live === true,
      level: "unknown",
      lastUpdated: readApiNumber(row.updatedAt ?? row.lastUpdated),
    },
    now,
  );
}

export function garagePanelCopy(garage: GarageMarkerData): {
  left: "GARAGE";
  center: string;
  right: string;
  secondary: string;
} {
  const center = garage.shortLabel.toUpperCase();
  if (!garage.live || garage.vacant == null) {
    return {
      left: "GARAGE",
      center,
      right: "PARKEREN",
      secondary: "Live bezetting niet beschikbaar",
    };
  }

  const right =
    garage.vacant === 0 ? "VOL" : `${garage.vacant.toLocaleString("nl-NL")} VRIJ`;
  const parts: string[] = [];
  if (garage.capacity != null) {
    parts.push(`${garage.capacity.toLocaleString("nl-NL")} plaatsen`);
  }
  if (garage.lastUpdated != null) {
    parts.push(
      `bijgewerkt ${formatInTimeZone(new Date(garage.lastUpdated), "Europe/Amsterdam", "HH:mm")}`,
    );
  }
  if (parts.length === 0) parts.push("Live bezetting via RDW/NPR");

  return {
    left: "GARAGE",
    center,
    right,
    secondary: parts.join(" · "),
  };
}
