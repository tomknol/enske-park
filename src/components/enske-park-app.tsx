"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Crosshair, Info } from "lucide-react";
import type { GarageMarkerData } from "@/components/parking-map";

const ParkingMap = dynamic(
  () => import("@/components/parking-map").then((m) => m.ParkingMap),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-slate-200 animate-pulse" aria-hidden />,
  },
);
import { PriceCard } from "@/components/price-card";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { isRelevantGermanHoliday } from "@/lib/holidays-de";
import {
  CENTRE_OUDE_MARKT,
  FREE_PARKING_SPOTS,
  directionsUrl,
} from "@/lib/free-parking";
import {
  resolveParkingAtLocation,
  zoneSheetDetails,
  type LocationKind,
} from "@/lib/parking-status";
import { walkingSummary } from "@/lib/walking";
import { locateUserInZones, type ZoneCollections } from "@/lib/zones";

type SheetState =
  | { type: "closed" }
  | { type: "zone"; kind: LocationKind; zoneRaw: string | null }
  | { type: "garage"; garage: GarageMarkerData }
  | { type: "free"; spotId: string }
  | { type: "info" };

export function EnskeParkApp() {
  const { state: geoState, retry: retryGeo } = useGeolocation();
  const [zones, setZones] = useState<ZoneCollections | null>(null);
  const [zonesMeta, setZonesMeta] = useState<{ fetchedAt: string; source: string } | null>(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState(false);

  const [garages, setGarages] = useState<GarageMarkerData[]>([]);
  const [garagesMeta, setGaragesMeta] = useState<{ fetchedAt: string; source: string } | null>(
    null,
  );

  const [followUser, setFollowUser] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [sheet, setSheet] = useState<SheetState>({ type: "closed" });
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setClock(new Date());
    const initial = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, []);

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    setZonesError(false);
    try {
      const res = await fetch("/api/zones");
      if (!res.ok) throw new Error("zones");
      const data = await res.json();
      setZones({ paid: data.paid, permit: data.permit });
      setZonesMeta({ fetchedAt: data.fetchedAt, source: data.source });
    } catch {
      setZonesError(true);
      setZones(null);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const loadGarages = useCallback(async () => {
    try {
      const res = await fetch("/api/garages", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setGarages(data.garages);
      setGaragesMeta({ fetchedAt: data.fetchedAt, source: data.source });
    } catch {
      /* garages fail independently */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadZones(), 0);
    return () => window.clearTimeout(t);
  }, [loadZones]);

  useEffect(() => {
    const boot = window.setTimeout(() => void loadGarages(), 0);
    const id = window.setInterval(() => void loadGarages(), 60_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(id);
    };
  }, [loadGarages]);

  const position = geoState.status === "ready" ? geoState.position : null;

  const geoPending = geoState.status === "pending";

  const userZone = useMemo(() => {
    if (!position || !zones) {
      return {
        kind: "outside" as const,
        zoneRaw: null,
        featureId: null,
        nearBoundary: false,
      };
    }
    return locateUserInZones(
      position.lon,
      position.lat,
      position.accuracy,
      zones,
    );
  }, [position, zones]);

  const snapshot = useMemo(
    () => resolveParkingAtLocation(userZone.kind, userZone.zoneRaw, clock ?? undefined),
    [userZone.kind, userZone.zoneRaw, clock],
  );

  const amsterdamToday = toZonedTime(clock ?? new Date(0), "Europe/Amsterdam");
  const germanHoliday = isRelevantGermanHoliday(amsterdamToday);

  const liveGarages = garages.filter((g) => g.live);
  const nearlyFullCount = liveGarages.filter(
    (g) => g.level === "full" || g.level === "busy",
  ).length;
  const busyUpgrade = germanHoliday && nearlyFullCount >= 2;

  const sheetOpen = sheet.type !== "closed";

  const sheetContent = useMemo(() => {
    if (sheet.type === "zone") {
      const details = zoneSheetDetails(sheet.kind, sheet.zoneRaw, clock ?? undefined);
      return { title: details.title, body: details.lines };
    }
    if (sheet.type === "garage") {
      const g = sheet.garage;
      const lines = [
        g.live && g.vacant != null
          ? `${g.vacant} plaatsen vrij${g.capacity ? ` van ${g.capacity}` : ""}`
          : "Live bezetting onbekend",
      ];
      if (g.live && g.capacity && g.vacant != null) {
        const pct = Math.round(((g.capacity - g.vacant) / g.capacity) * 100);
        lines.push(`Bezetting: ${pct}%`);
      }
      if (g.lastUpdated) {
        lines.push(
          `Laatste update: ${format(new Date(g.lastUpdated), "HH:mm")}`,
        );
      }
      return { title: g.label, body: lines };
    }
    if (sheet.type === "free") {
      const spot = FREE_PARKING_SPOTS.find((s) => s.id === sheet.spotId);
      if (!spot) return { title: "Gratis parkeren", body: [] };
      return {
        title: "Gratis parkeren",
        body: [
          spot.name,
          walkingSummary(spot.lon, spot.lat, CENTRE_OUDE_MARKT.lon, CENTRE_OUDE_MARKT.lat),
          spot.note,
          "Controleer altijd de borden ter plaatse",
        ],
        route: directionsUrl(spot.lat, spot.lon),
      };
    }
    if (sheet.type === "info") {
      return {
        title: "Over EnsKe Park",
        body: [
          "EnsKe Park combineert openbare parkeerdata van de gemeente Enschede en RDW met je huidige locatie. Borden en aanwijzingen op straat zijn altijd leidend.",
          zonesMeta
            ? `Zonekaart: ${zonesMeta.source} (geladen ${format(new Date(zonesMeta.fetchedAt), "dd-MM-yyyy HH:mm")})`
            : "",
          garagesMeta
            ? `Garages: ${garagesMeta.source}${garagesMeta.fetchedAt ? ` · ${format(new Date(garagesMeta.fetchedAt), "HH:mm")}` : ""}`
            : "",
        ].filter(Boolean),
      };
    }
    return { title: "", body: [] as string[] };
  }, [sheet, clock, zonesMeta, garagesMeta]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      <ParkingMap
        zones={zones}
        position={position}
        followUser={followUser}
        onUserMovedMap={() => setFollowUser(false)}
        garages={garages}
        onZoneSelect={({ kind, zoneRaw }) =>
          setSheet({ type: "zone", kind, zoneRaw })
        }
        onGarageSelect={(garage) => setSheet({ type: "garage", garage })}
        onFreeSelect={(spotId) => setSheet({ type: "free", spotId })}
        recenterToken={recenterToken}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 px-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
              EnsKe Park
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="pointer-events-auto shrink-0 rounded-full shadow-md"
            aria-label="Informatie"
            onClick={() => setSheet({ type: "info" })}
          >
            <Info className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        <PriceCard
          snapshot={snapshot}
          nearBoundary={userZone.nearBoundary}
          zonesLoading={zonesLoading}
          zonesError={zonesError}
          geoPending={geoPending}
          germanHoliday={germanHoliday}
          busyUpgrade={busyUpgrade}
        />

        {(geoState.status === "denied" || geoState.status === "unavailable") && (
          <div className="pointer-events-auto rounded-xl bg-white/95 px-4 py-3 text-sm shadow-md ring-1 ring-slate-200">
            <p className="font-medium text-slate-900">
              {geoState.status === "denied"
                ? "Locatie nodig om je huidige tarief te bepalen"
                : geoState.message}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={retryGeo}
            >
              Opnieuw proberen
            </Button>
          </div>
        )}
      </div>

      <div
        className="absolute z-10 flex flex-col gap-2"
        style={{
          left: "max(1rem, env(safe-area-inset-left))",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="rounded-full shadow-lg"
          aria-label="Naar mijn locatie"
          onClick={() => {
            setFollowUser(true);
            setRecenterToken((t) => t + 1);
          }}
          disabled={!position}
        >
          <Crosshair className="h-5 w-5" aria-hidden />
        </Button>
      </div>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={(open) => !open && setSheet({ type: "closed" })}
        title={sheetContent.title}
      >
        <div className="space-y-2">
          {sheetContent.body.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {sheet.type === "free" && "route" in sheetContent && sheetContent.route && (
            <Button asChild className="mt-4 w-full">
              <a href={sheetContent.route} target="_blank" rel="noopener noreferrer">
                Route
              </a>
            </Button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
