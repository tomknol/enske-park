import { NextResponse } from "next/server";
import {
  ENSCHEDE_CENTRAL_GARAGES,
  GARAGE_STALE_MS,
  occupancyLevel,
} from "@/lib/garages";

const RDW_STATIC = "https://npropendata.rdw.nl/parkingdata/v2/static";
const RDW_DYNAMIC = "https://npropendata.rdw.nl/parkingdata/v2/dynamic";

type RdwStatic = {
  parkingFacilityInformation: {
    name: string;
    identifier: string;
    locationForDisplay?: { latitude: number; longitude: number };
    specifications?: { capacity?: number }[];
    accessPoints?: {
      accessPointLocation?: { latitude: number; longitude: number }[];
    }[];
  };
};

type RdwDynamic = {
  parkingFacilityDynamicInformation?: {
    facilityActualStatus?: {
      lastUpdated?: string;
      parkingCapacity?: string;
      vacantSpaces?: string;
      full?: boolean;
    };
  };
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const garages = await Promise.all(
    ENSCHEDE_CENTRAL_GARAGES.map(async (meta) => {
      const staticData = await fetchJson<RdwStatic>(`${RDW_STATIC}/${meta.id}`);
      const info = staticData?.parkingFacilityInformation;

      let lat = info?.locationForDisplay?.latitude ?? null;
      let lon = info?.locationForDisplay?.longitude ?? null;
      if ((lat == null || lon == null) && info?.accessPoints?.[0]?.accessPointLocation?.[0]) {
        const loc = info.accessPoints[0].accessPointLocation[0];
        lat = loc.latitude;
        lon = loc.longitude;
      }

      const capacityFromStatic = info?.specifications?.find((s) => s.capacity)?.capacity ?? null;

      let vacant: number | null = null;
      let capacity: number | null = capacityFromStatic;
      let full: boolean | null = null;
      let lastUpdated: number | null = null;
      let live = false;

      if (!("dynamicRestricted" in meta && meta.dynamicRestricted)) {
        const dynamic = await fetchJson<RdwDynamic>(`${RDW_DYNAMIC}/${meta.id}`);
        const status = dynamic?.parkingFacilityDynamicInformation?.facilityActualStatus;
        if (status?.lastUpdated) {
          const ts = Number.parseInt(status.lastUpdated, 10) * 1000;
          if (Number.isFinite(ts) && Date.now() - ts <= GARAGE_STALE_MS) {
            live = true;
            lastUpdated = ts;
            vacant =
              status.vacantSpaces != null ? Number.parseInt(status.vacantSpaces, 10) : null;
            capacity =
              status.parkingCapacity != null
                ? Number.parseInt(status.parkingCapacity, 10)
                : capacityFromStatic;
            full = status.full ?? null;
          } else if (Number.isFinite(ts)) {
            lastUpdated = ts;
          }
        }
      }

      const level = live ? occupancyLevel(vacant, capacity, full) : "unknown";

      return {
        id: meta.id,
        label: meta.label,
        shortLabel: meta.shortLabel,
        lat,
        lon,
        capacity,
        vacant: live ? vacant : null,
        full: live ? full : null,
        live,
        level,
        lastUpdated,
      };
    }),
  );

  return NextResponse.json({ garages });
}
