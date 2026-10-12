import {
  GARAGE_FRESH_MS,
  occupancyLevel,
  type GarageMarkerData,
} from "@/lib/garages";

/**
 * Enschede garages in the Nationaal Parkeerregister.
 * UUIDs are matched against the V2 index; the facility code is the municipal id.
 * A second Hermandad record and the limited Q-Park city record are omitted:
 * they are not the published 153_HERM / Stationsplein garages.
 */
export const ENSCHEDE_GARAGES = [
  {
    facilityCode: "153_HEEK",
    id: "1a39c8e9-91f9-40d9-bdf3-ce1f6e438a14",
    label: "H.J. van Heekgarage",
    shortLabel: "Van Heek",
    municipalCapacity: 1700,
    fallbackLatitude: 52.216916,
    fallbackLongitude: 6.901198,
  },
  {
    facilityCode: "153_IRE",
    id: "824a6cd5-acd4-4d88-893e-d38aa1fc5116",
    label: "Irenegarage",
    shortLabel: "Irene",
    municipalCapacity: 475,
    fallbackLatitude: 52.222013,
    fallbackLongitude: 6.898074,
  },
  {
    facilityCode: "153_MOO",
    id: "480c50ad-2ef0-48df-8dbc-d2c8552151fd",
    label: "Parkeergarage Mooienhof",
    shortLabel: "Mooienhof",
    municipalCapacity: 100,
    fallbackLatitude: 52.218262,
    fallbackLongitude: 6.893268,
  },
  {
    facilityCode: "153_STAT",
    id: "51e760d1-9c5b-479b-bede-b31cd56911d0",
    label: "Parkeergarage Station",
    shortLabel: "Station",
    municipalCapacity: 325,
    fallbackLatitude: 52.22163,
    fallbackLongitude: 6.891746,
  },
  {
    facilityCode: "153_HERM",
    id: "f52ac3d2-2c37-4f22-8851-e4b154f0b2ba",
    label: "Garage Hermandad",
    shortLabel: "Hermandad",
    municipalCapacity: 275,
    fallbackLatitude: 52.219048,
    fallbackLongitude: 6.890557,
  },
  {
    facilityCode: "153_BROU",
    id: "335d508f-cb75-480d-b034-b30f128fccce",
    label: "Parkeergarage Brouwerij",
    shortLabel: "Brouwerij",
    municipalCapacity: 300,
    fallbackLatitude: 52.231866,
    fallbackLongitude: 6.890873,
  },
] as const;

export type EnschedeGarage = (typeof ENSCHEDE_GARAGES)[number];

export type NprIndexFacility = {
  identifier?: string;
  staticDataUrl?: string;
  dynamicDataUrl?: string;
  limitedAccess?: boolean;
};

export type GarageFeedRecord = GarageMarkerData & {
  facilityCode: string;
  name: string;
  longitude: number | null;
  latitude: number | null;
  freeSpaces: number | null;
  occupancyPercent: number | null;
  isOpen: boolean | null;
  updatedAt: number | null;
};

export type GarageDynamicReading = {
  matched: boolean;
  freeSpaces: number | null;
  capacity: number | null;
  isOpen: boolean | null;
  updatedAt: number | null;
  live: boolean;
};

const EMPTY_DYNAMIC: GarageDynamicReading = {
  matched: false,
  freeSpaces: null,
  capacity: null,
  isOpen: null,
  updatedAt: null,
  live: false,
};

export function preferredNprUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.protocol === "http:" && parsed.hostname === "npropendata.rdw.nl") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function matchNprFacility<T extends { identifier?: string }>(
  facilities: readonly T[],
  id: string,
): T | null {
  return facilities.find((facility) => facility.identifier === id) ?? null;
}

export function interpretGarageDynamic(options: {
  payload: unknown;
  expectedId: string;
  capacity: number | null;
  now?: number;
}): GarageDynamicReading {
  const fields = readDynamicFields(options.payload);
  if (!fields?.identifier || fields.identifier !== options.expectedId) return EMPTY_DYNAMIC;

  const now = options.now ?? Date.now();
  const unread: GarageDynamicReading = {
    matched: true,
    freeSpaces: null,
    capacity: fields.capacity,
    isOpen: null,
    updatedAt: fields.updatedAt,
    live: false,
  };

  if (fields.updatedAt == null || !timestampIsFresh(fields.updatedAt, now)) return unread;
  if (fields.vacantPresent && fields.vacant == null) return unread;

  let freeSpaces = fields.vacant;
  if (freeSpaces == null && fields.full === true) freeSpaces = 0;
  if (freeSpaces == null) return unread;
  if (fields.full === true && freeSpaces > 0) return unread;

  const capacity = fields.capacity ?? options.capacity;
  if (capacity != null && freeSpaces > capacity) return unread;

  return {
    matched: true,
    freeSpaces,
    capacity: fields.capacity,
    isOpen: fields.open,
    updatedAt: fields.updatedAt,
    live: true,
  };
}

export function resolveEnschedeGarage(input: {
  catalog: EnschedeGarage;
  staticPayload: unknown | null;
  dynamicPayload: unknown | null;
  now?: number;
}): GarageFeedRecord {
  const now = input.now ?? Date.now();
  const staticInfo = readStaticFacility(input.staticPayload, input.catalog.id);
  const capacityBase =
    staticInfo.capacity ?? input.catalog.municipalCapacity;
  const latitude = staticInfo.latitude ?? input.catalog.fallbackLatitude;
  const longitude = staticInfo.longitude ?? input.catalog.fallbackLongitude;

  const dynamic =
    staticInfo.trusted && input.dynamicPayload != null
      ? interpretGarageDynamic({
          payload: input.dynamicPayload,
          expectedId: input.catalog.id,
          capacity: capacityBase,
          now,
        })
      : null;

  const capacity = dynamic?.capacity ?? capacityBase;
  const live = dynamic?.live === true && dynamic.freeSpaces != null;
  const freeSpaces = live ? dynamic.freeSpaces : null;
  const occupancyPercent =
    live && capacity > 0 && freeSpaces != null
      ? Math.round(((capacity - freeSpaces) / capacity) * 100)
      : null;

  return {
    id: input.catalog.id,
    facilityCode: input.catalog.facilityCode,
    name: input.catalog.label,
    label: input.catalog.label,
    shortLabel: input.catalog.shortLabel,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    capacity,
    freeSpaces,
    vacant: freeSpaces,
    occupancyPercent,
    isOpen: live ? (dynamic?.isOpen ?? null) : null,
    live,
    level: live ? occupancyLevel(freeSpaces, capacity, freeSpaces === 0) : "unknown",
    updatedAt: dynamic?.updatedAt ?? null,
    lastUpdated: dynamic?.updatedAt ?? null,
  };
}

function timestampIsFresh(updatedAt: number, now: number): boolean {
  const age = now - updatedAt;
  return age >= -60_000 && age <= GARAGE_FRESH_MS;
}

type DynamicFields = {
  identifier: string | null;
  vacant: number | null;
  vacantPresent: boolean;
  capacity: number | null;
  full: boolean | null;
  open: boolean | null;
  updatedAt: number | null;
};

function readDynamicFields(payload: unknown): DynamicFields | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("<")) return readXmlDynamic(trimmed);
    try {
      return readDynamicFields(JSON.parse(trimmed) as unknown);
    } catch {
      return null;
    }
  }

  const root = asRecord(payload);
  if (!root) return null;
  const info = asRecord(root.parkingFacilityDynamicInformation) ?? root;
  const status = asRecord(info.facilityActualStatus) ?? info;
  const vacantRaw = status.vacantSpaces ?? status.totalNumberOfVacantParkingSpaces;

  return {
    identifier:
      readString(info.identifier) ??
      readString(status.identifier) ??
      readString(root.identifier),
    vacant: readCount(vacantRaw),
    vacantPresent: vacantRaw != null && vacantRaw !== "",
    capacity: readCount(status.parkingCapacity ?? status.totalCapacity),
    full: readBoolean(status.full),
    open: readBoolean(status.open ?? status.isOpen),
    updatedAt: readTimestamp(
      status.lastUpdated ?? status.statusDateTime ?? status.parkingFacilityStatusTime,
    ),
  };
}

function readXmlDynamic(xml: string): DynamicFields {
  const vacantText = xmlTag(xml, ["totalNumberOfVacantParkingSpaces", "vacantSpaces"]);
  const capacityText = xmlTag(xml, ["parkingCapacity", "totalCapacity"]);
  const updatedText = xmlTag(xml, [
    "lastUpdated",
    "statusDateTime",
    "parkingFacilityStatusTime",
  ]);
  const fullText = xmlTag(xml, ["full"]);
  const openText = xmlTag(xml, ["open", "isOpen"]);
  return {
    identifier: xmlTag(xml, ["identifier", "facilityReference", "parkingFacilityReference"]),
    vacant: vacantText == null ? null : readCount(vacantText),
    vacantPresent: vacantText != null,
    capacity: capacityText == null ? null : readCount(capacityText),
    full: fullText == null ? null : readBoolean(fullText),
    open: openText == null ? null : readBoolean(openText),
    updatedAt: updatedText == null ? null : readTimestamp(updatedText),
  };
}

function readStaticFacility(
  payload: unknown,
  expectedId: string,
): {
  trusted: boolean;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
} {
  const empty = { trusted: true, capacity: null, latitude: null, longitude: null };
  if (payload == null) return empty;

  const parsed = typeof payload === "string" ? parseJson(payload) : payload;
  if (parsed == null) return empty;

  const root = asRecord(parsed);
  const info = asRecord(root?.parkingFacilityInformation);
  if (!info) return empty;

  const identifier = readString(info.identifier);
  if (identifier && identifier !== expectedId) {
    return { trusted: false, capacity: null, latitude: null, longitude: null };
  }

  const operatorName = readString(asRecord(info.operator)?.name);
  if (operatorName && !operatorName.toLowerCase().includes("enschede")) {
    return { trusted: false, capacity: null, latitude: null, longitude: null };
  }

  let capacity: number | null = null;
  if (Array.isArray(info.specifications)) {
    for (const spec of info.specifications) {
      const value = readCount(asRecord(spec)?.capacity);
      if (value != null && value > 0) {
        capacity = value;
        break;
      }
    }
  }

  const display = asRecord(info.locationForDisplay);
  let latitude = readCoord(display?.latitude);
  let longitude = readCoord(display?.longitude);
  if (latitude == null || longitude == null) {
    const points = Array.isArray(info.accessPoints) ? info.accessPoints : [];
    const locations = asRecord(points[0])?.accessPointLocation;
    const loc = asRecord(Array.isArray(locations) ? locations[0] : null);
    latitude = readCoord(loc?.latitude);
    longitude = readCoord(loc?.longitude);
  }
  if (
    latitude != null &&
    longitude != null &&
    (latitude < 52.15 || latitude > 52.32 || longitude < 6.75 || longitude > 7.05)
  ) {
    latitude = null;
    longitude = null;
  }

  return { trusted: true, capacity, latitude, longitude };
}

function xmlTag(xml: string, names: string[]): string | null {
  for (const name of names) {
    const match = xml.match(
      new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w.-]+:)?${name}>`, "i"),
    );
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function readCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
}

function readTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return null;
      return parsed > 1e12 ? parsed : parsed * 1000;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
