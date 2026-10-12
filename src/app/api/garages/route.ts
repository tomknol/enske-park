import { connection, NextResponse } from "next/server";
import {
  ENSCHEDE_GARAGES,
  matchNprFacility,
  preferredNprUrl,
  resolveEnschedeGarage,
  type NprIndexFacility,
} from "@/lib/npr-garages";

const NPR_INDEX_URL = "https://npropendata.rdw.nl/parkingdata/v2";
const INDEX_CACHE_MS = 10 * 60 * 1000;

let indexCache: { at: number; facilities: NprIndexFacility[] } | null = null;
const staticCache = new Map<string, { at: number; payload: unknown }>();

export async function GET() {
  await connection();
  const facilities = await loadFacilityIndex();
  const now = Date.now();

  const garages = await Promise.all(
    ENSCHEDE_GARAGES.map(async (catalog) => {
      const indexed = matchNprFacility(facilities, catalog.id);
      const staticUrl = preferredNprUrl(indexed?.staticDataUrl);
      const dynamicUrl = indexed?.limitedAccess
        ? null
        : preferredNprUrl(indexed?.dynamicDataUrl);

      const [staticPayload, dynamicPayload] = await Promise.all([
        staticUrl ? loadStatic(staticUrl, now) : Promise.resolve(null),
        dynamicUrl ? fetchPayload(dynamicUrl) : Promise.resolve(null),
      ]);

      return resolveEnschedeGarage({
        catalog,
        staticPayload,
        dynamicPayload,
        now,
      });
    }),
  );

  return NextResponse.json(
    { garages },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function loadFacilityIndex(): Promise<NprIndexFacility[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_CACHE_MS) {
    return indexCache.facilities;
  }
  const payload = await fetchPayload(NPR_INDEX_URL);
  const facilities = Array.isArray((payload as { ParkingFacilities?: unknown } | null)?.ParkingFacilities)
    ? ((payload as { ParkingFacilities: NprIndexFacility[] }).ParkingFacilities)
    : [];
  if (facilities.length > 0) {
    indexCache = { at: Date.now(), facilities };
    return facilities;
  }
  return indexCache?.facilities ?? [];
}

async function loadStatic(url: string, now: number): Promise<unknown | null> {
  const cached = staticCache.get(url);
  if (cached && now - cached.at < INDEX_CACHE_MS) return cached.payload;
  const payload = await fetchPayload(url);
  if (payload != null) staticCache.set(url, { at: now, payload });
  return payload;
}

async function fetchPayload(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("xml") || text.trimStart().startsWith("<")) return text;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
