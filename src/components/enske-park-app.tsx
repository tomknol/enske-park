"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { Crosshair, Info } from "lucide-react";
import {
  MapSearchControl,
  type GeocodeResult,
} from "@/components/map-search-control";
import { ParkingContextPanel } from "@/components/parking-context-panel";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useStableUserZone } from "@/hooks/use-stable-user-zone";
import { stadserfBoundaryData as stadserfBoundary } from "@/data/stadserf-boundary-data";
import { findDurationRestriction } from "@/lib/duration-restrictions";
import type { GarageMarkerData } from "@/lib/garages";
import { isRelevantGermanHoliday } from "@/lib/holidays-de";
import type { MapPanelContext } from "@/lib/panel-context";
import { resolveParkingAtLocation } from "@/lib/parking-status";
import { activeZoneLabelKey, zoneCollectionKey } from "@/lib/zone-labels";
import { locateUserInZones, type ZoneCollections } from "@/lib/zones";
const ParkingMap = dynamic(
  () => import("@/components/parking-map").then((m) => m.ParkingMap),
  {
    ssr: false,
    loading: () => <div className="map-shell absolute inset-0" aria-hidden />,
  },
);

export function EnskeParkApp() {
  const { state: geoState, retry: retryGeo } = useGeolocation();
  const [zones, setZones] = useState<ZoneCollections | null>(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState(false);
  const [garages, setGarages] = useState<GarageMarkerData[]>([]);

  const [followUser, setFollowUser] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [mapContext, setMapContext] = useState<MapPanelContext | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lon: number; lat: number; token: number } | null>(
    null,
  );

  const [hoveredZone, setHoveredZone] = useState<{
    kind: "paid" | "permit";
    zoneRaw: string | null;
  } | null>(null);
  const [clock, setClock] = useState<Date | null>(null);

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    setZonesError(false);
    try {
      const res = await fetch("/api/zones");
      if (!res.ok) throw new Error("zones");
      const data = await res.json();
      setZones({ paid: data.paid, permit: data.permit });
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
    } catch {
      /* optional */
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

  const rawUserZone = useMemo(() => {
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

  const userZone = useStableUserZone(rawUserZone);

  const currentZoneLabelKey = useMemo(
    () => activeZoneLabelKey(userZone.kind, userZone.zoneRaw),
    [userZone.kind, userZone.zoneRaw],
  );

  const selectedZoneKey = useMemo(() => {
    if (mapContext?.type === "zone") {
      return zoneCollectionKey(mapContext.kind, mapContext.zoneRaw);
    }
    if (mapContext?.type === "destination" && mapContext.kind !== "outside") {
      return zoneCollectionKey(mapContext.kind, mapContext.zoneRaw);
    }
    return null;
  }, [mapContext]);

  const snapshot = useMemo(
    () => resolveParkingAtLocation(userZone.kind, userZone.zoneRaw, clock ?? undefined),
    [userZone.kind, userZone.zoneRaw, clock],
  );

  const panelPoint = useMemo(() => {
    if (hoveredZone) return null;
    if (mapContext?.type === "destination") {
      return { lon: mapContext.lon, lat: mapContext.lat };
    }
    if (mapContext?.type === "zone" && mapContext.lon != null && mapContext.lat != null) {
      return { lon: mapContext.lon, lat: mapContext.lat };
    }
    if (position) return { lon: position.lon, lat: position.lat };
    return null;
  }, [hoveredZone, mapContext, position]);

  const durationRestriction = useMemo(() => {
    if (!panelPoint) return null;
    return findDurationRestriction(panelPoint.lon, panelPoint.lat);
  }, [panelPoint]);

  const needsLiveCountdown = useMemo(() => {
    const hasCountdown = (kind: "paid" | "permit" | "outside", zoneRaw: string | null) => {
      if (kind !== "paid") return false;
      const snap = resolveParkingAtLocation(kind, zoneRaw, clock ?? undefined);
      return snap.paidStartsAt != null && !snap.isPaidNow;
    };
    if (mapContext == null && hasCountdown(userZone.kind, userZone.zoneRaw)) return true;
    if (hoveredZone && hasCountdown(hoveredZone.kind, hoveredZone.zoneRaw)) return true;
    if (mapContext?.type === "zone") {
      return hasCountdown(mapContext.kind, mapContext.zoneRaw);
    }
    if (mapContext?.type === "destination") {
      return hasCountdown(mapContext.kind, mapContext.zoneRaw);
    }
    return false;
  }, [userZone.kind, userZone.zoneRaw, hoveredZone, mapContext, clock]);

  useEffect(() => {
    const tick = () => setClock(new Date());
    const initial = window.setTimeout(tick, 0);
    const intervalMs = needsLiveCountdown ? 1000 : 30_000;
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [needsLiveCountdown]);

  const amsterdamToday = toZonedTime(clock ?? new Date(0), "Europe/Amsterdam");
  const germanHoliday = isRelevantGermanHoliday(amsterdamToday);

  const liveGarages = garages.filter((g) => g.live);
  const nearlyFullCount = liveGarages.filter(
    (g) => g.level === "full" || g.level === "busy",
  ).length;
  const busyUpgrade = germanHoliday && nearlyFullCount >= 2;

  const clearContext = useCallback(() => {
    setMapContext(null);
    setEstimatorOpen(false);
    setSearchOpen(false);
  }, []);

  const handleUserMovedMap = useCallback(() => setFollowUser(false), []);

  const handleZoneSelect = useCallback(
    (payload: {
      kind: "paid" | "permit";
      zoneRaw: string | null;
      gebiedCod: string | null;
    }) => {
      setEstimatorOpen(false);
      setMapContext({
        type: "zone",
        kind: payload.kind,
        zoneRaw: payload.zoneRaw,
      });
    },
    [],
  );

  const handleGarageSelect = useCallback((garage: GarageMarkerData) => {
    setEstimatorOpen(false);
    setMapContext({ type: "garage", garage });
  }, []);

  const handlePnrSelect = useCallback(() => {
    setEstimatorOpen(false);
    setMapContext({ type: "pnr" });
  }, []);

  const handleMapBackgroundClick = useCallback(() => {
    setHoveredZone(null);
    clearContext();
  }, [clearContext]);

  const handleZoneHoverChange = useCallback(
    (zone: { kind: "paid" | "permit"; zoneRaw: string | null } | null) => {
      setHoveredZone(zone);
    },
    [],
  );

  const handleSearchSelect = useCallback(
    (result: GeocodeResult) => {
      if (!zones) return;
      const match = locateUserInZones(result.lon, result.lat, null, zones);
      setFollowUser(false);
      setFlyTo({ lon: result.lon, lat: result.lat, token: Date.now() });
      setEstimatorOpen(false);
      setMapContext({
        type: "destination",
        label: result.label,
        lon: result.lon,
        lat: result.lat,
        kind: match.kind,
        zoneRaw: match.zoneRaw,
      });
    },
    [zones],
  );

  const destinationPin =
    mapContext?.type === "destination"
      ? { lon: mapContext.lon, lat: mapContext.lat }
      : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--background)]">
      <div className="map-vignette pointer-events-none absolute inset-0 z-[1]" aria-hidden />
      <ParkingMap
        zones={zones}
        position={position}
        followUser={followUser}
        onUserMovedMap={handleUserMovedMap}
        onZoneSelect={handleZoneSelect}
        onGarageSelect={handleGarageSelect}
        onPnrSelect={handlePnrSelect}
        garages={garages}
        stadserfBoundary={stadserfBoundary}
        destination={destinationPin}
        flyTo={flyTo}
        onMapBackgroundClick={handleMapBackgroundClick}
        recenterToken={recenterToken}
        activeZoneLabelKey={currentZoneLabelKey}
        selectedZoneKey={selectedZoneKey}
        onZoneHoverChange={handleZoneHoverChange}
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <ParkingContextPanel
          snapshot={snapshot}
          locationKind={userZone.kind}
          zoneRaw={userZone.zoneRaw}
          nearBoundary={userZone.nearBoundary}
          zonesLoading={zonesLoading}
          zonesError={zonesError}
          geoPending={geoPending}
          geoDenied={geoState.status === "denied"}
          geoUnavailableMessage={
            geoState.status === "unavailable" ? geoState.message : null
          }
          onRetryGeo={retryGeo}
          germanHoliday={germanHoliday}
          busyUpgrade={busyUpgrade}
          mapContext={mapContext}
          hoveredZone={hoveredZone}
          durationRestriction={durationRestriction}
          estimatorOpen={estimatorOpen}
          onEstimatorOpenChange={setEstimatorOpen}
          onClearContext={clearContext}
          clock={clock ?? undefined}
          panelLon={panelPoint?.lon ?? null}
          panelLat={panelPoint?.lat ?? null}
        />
      </div>

      <div
        className="map-attribution pointer-events-none absolute z-[25]"
        style={{
          left: "max(8px, env(safe-area-inset-left))",
          bottom: "max(4px, env(safe-area-inset-bottom))",
        }}
      >
        <p className="map-attribution-text">
          <a
            className="map-attribution-link"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            © OpenStreetMap
          </a>
          {" · "}
          <a
            className="map-attribution-link"
            href="https://openfreemap.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenFreeMap
          </a>
        </p>
      </div>

      <div
        className="map-controls absolute z-20 flex flex-col items-end gap-2"
        style={{
          right: "max(12px, env(safe-area-inset-right))",
          bottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <MapSearchControl
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelect={handleSearchSelect}
        />
        <div className="map-control-dock">
          {mapContext == null && !searchOpen && (
            <button
              type="button"
              className="map-float-btn"
              aria-label="Over Enske Park"
              onClick={() => setMapContext({ type: "info" })}
            >
              <Info className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} aria-hidden />
            </button>
          )}
          <button
            type="button"
            className={`map-float-btn${followUser && position ? " map-float-btn--active" : ""}`}
            aria-label="Naar mijn locatie"
            disabled={!position}
            onClick={() => {
              clearContext();
              setFollowUser(true);
              setRecenterToken((t) => t + 1);
            }}
          >
            <Crosshair className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
