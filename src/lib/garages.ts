/** Central Enschede garages with RDW/NPR identifiers (static + dynamic where available). */
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

export function occupancyColors(level: GarageOccupancyLevel): {
  bg: string;
  text: string;
  border: string;
} {
  switch (level) {
    case "plenty":
      return { bg: "#ecfdf5", text: "#047857", border: "#6ee7b7" };
    case "busy":
      return { bg: "#fffbeb", text: "#b45309", border: "#fcd34d" };
    case "full":
      return { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5" };
    default:
      return { bg: "#f4f4f5", text: "#52525b", border: "#d4d4d8" };
  }
}

export function formatGarageMarkerLabel(
  level: GarageOccupancyLevel,
  vacant: number | null,
): string {
  if (level === "unknown") return "P ?";
  if (level === "full") return "P VOL";
  if (vacant != null) return `P ${vacant}`;
  return "P";
}
