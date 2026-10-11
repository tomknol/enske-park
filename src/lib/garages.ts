/** Central Enschede garages — RDW NPR facility identifiers. */
export const ENSCHEDE_CENTRAL_GARAGES = [
  {
    id: "1a39c8e9-91f9-40d9-bdf3-ce1f6e438a14",
    label: "H.J. van Heekgarage",
    shortLabel: "Van Heek",
  },
  {
    id: "824a6cd5-acd4-4d88-893e-d38aa1fc5116",
    label: "Irenegarage",
    shortLabel: "Irene",
  },
  {
    id: "480c50ad-2ef0-48df-8dbc-d2c8552151fd",
    label: "Parkeergarage Mooienhof",
    shortLabel: "Mooienhof",
  },
  {
    id: "84c88d2a-8663-459a-856e-b73c7ab17ef4",
    label: "Q-Park Stationsplein",
    shortLabel: "Stationspl.",
    dynamicRestricted: true,
  },
] as const;

export const GARAGE_STALE_MS = 30 * 60 * 1000;

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

export function occupancyLevel(
  vacant: number | null,
  capacity: number | null,
  full: boolean | null,
): GarageOccupancyLevel {
  if (full) return "full";
  if (vacant == null || capacity == null || capacity <= 0) return "unknown";
  const ratio = vacant / capacity;
  if (ratio <= 0.08) return "full";
  if (ratio <= 0.25) return "busy";
  return "plenty";
}

export function formatGarageMarkerLabel(
  level: GarageOccupancyLevel,
  vacant: number | null,
): string {
  if (level === "unknown") return "P";
  if (level === "full") return "P VOL";
  if (vacant != null) return `P ${vacant}`;
  return "P";
}
