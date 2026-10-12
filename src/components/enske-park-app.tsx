"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { clearGarageLive, garageFromApi, type GarageMarkerData } from "@/lib/garages";
import { isRelevantGermanHoliday } from "@/lib/holidays-de";
import {
  hoverReplacesContext,
  isSameSelectedZone,
  type HoveredMapFeature,
  type MapPanelContext,
} from "@/lib/panel-context";
import { resolveParkingAtLocation } from "@/lib/parking-status";
import { isPointInStadserf, isStadserfAccessOpen } from "@/lib/stadserf";
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

  const [hoveredZone, setHoveredZone] = useState<HoveredMapFeature | null>(null);
  const [hoverClearToken, setHoverClearToken] = useState(0);
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

  const garageRequestRef = useRef(0);

  const loadGarages = useCallback(async () => {
    const requestId = ++garageRequestRef.current;
    try {
      const res = await fetch("/api/garages", { cache: "no-store" });
      if (requestId !== garageRequestRef.current) return;
      if (!res.ok) throw new Error("garages");
      const data = await res.json();
      if (!Array.isArray(data?.garages)) throw new Error("garages");
      const next = data.garages
        .map((garage: unknown) => garageFromApi(garage))
        .filter((garage: GarageMarkerData | null): garage is GarageMarkerData => garage != null);
      if (next.length === 0) throw new Error("garages");
      setGarages(next);
    } catch {
      if (requestId !== garageRequestRef.current) return;
      setGarages((current) => current.map(clearGarageLive));
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadZones(), 0);
    return () => window.clearTimeout(t);
  }, [loadZones]);

  useEffect(() => {
    let interval = 0;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void loadGarages();
    };
    const boot = window.setTimeout(refresh, 0);
    interval = window.setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
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

  const userInStadserf = Boolean(
    position && isPointInStadserf(position.lon, position.lat),
  );

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
    if (mapContext?.type === "point" && mapContext.kind !== "outside") {
      return zoneCollectionKey(mapContext.kind, mapContext.zoneRaw);
    }
    return null;
  }, [mapContext]);

  const snapshot = useMemo(
    () => resolveParkingAtLocation(userZone.kind, userZone.zoneRaw, clock ?? undefined),
    [userZone.kind, userZone.zoneRaw, clock],
  );

  const panelPoint = useMemo(() => {
    if (hoverReplacesContext(hoveredZone, mapContext)) return null;
    if (mapContext?.type === "destination") {
      return { lon: mapContext.lon, lat: mapContext.lat };
    }
    if (mapContext?.type === "point") {
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
    const now = clock ?? new Date();
    const hoverPreview = hoverReplacesContext(hoveredZone, mapContext) ? hoveredZone : null;
    const stadserfVisible =
      mapContext?.type === "stadserf" ||
      mapContext?.type === "stadserf-access" ||
      hoverPreview?.kind === "stadserf" ||
      hoverPreview?.kind === "stadserf-access" ||
      (mapContext == null && hoverPreview == null && userInStadserf);
    if (stadserfVisible && isStadserfAccessOpen(now)) return true;

    const hasCountdown = (kind: "paid" | "permit" | "outside", zoneRaw: string | null) => {
      if (kind !== "paid") return false;
      const snap = resolveParkingAtLocation(kind, zoneRaw, clock ?? undefined);
      return snap.paidStartsAt != null && !snap.isPaidNow;
    };
    if (mapContext == null && hasCountdown(userZone.kind, userZone.zoneRaw)) return true;
    if (
      hoverPreview &&
      (hoverPreview.kind === "paid" || hoverPreview.kind === "permit") &&
      hasCountdown(hoverPreview.kind, hoverPreview.zoneRaw)
    ) {
      return true;
    }
    if (mapContext?.type === "zone") {
      return hasCountdown(mapContext.kind, mapContext.zoneRaw);
    }
    if (mapContext?.type === "destination") {
      return hasCountdown(mapContext.kind, mapContext.zoneRaw);
    }
    if (mapContext?.type === "point") {
      return hasCountdown(mapContext.kind, mapContext.zoneRaw);
    }
    return false;
  }, [userZone.kind, userZone.zoneRaw, hoveredZone, mapContext, clock, userInStadserf]);

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
    setHoveredZone(null);
    setEstimatorOpen(false);
    setSearchOpen(false);
    setHoverClearToken((token) => token + 1);
  }, []);

  const handleUserMovedMap = useCallback(() => setFollowUser(false), []);

  const handleZoneSelect = useCallback(
    (payload: {
      kind: "paid" | "permit";
      zoneRaw: string | null;
      gebiedCod: string | null;
      lon?: number;
      lat?: number;
    }) => {
      if (isSameSelectedZone(mapContext, payload.kind, payload.zoneRaw)) {
        clearContext();
        return;
      }
      setEstimatorOpen(false);
      setMapContext({
        type: "zone",
        kind: payload.kind,
        zoneRaw: payload.zoneRaw,
        lon: payload.lon,
        lat: payload.lat,
      });
    },
    [clearContext, mapContext],
  );

  const handleGarageSelect = useCallback((garage: GarageMarkerData) => {
    setEstimatorOpen(false);
    setMapContext({ type: "garage", garage });
  }, []);

  const handleStadserfSelect = useCallback(() => {
    setEstimatorOpen(false);
    setMapContext({ type: "stadserf" });
  }, []);

  const handleStadserfAccessSelect = useCallback((id: string) => {
    setEstimatorOpen(false);
    setMapContext({ type: "stadserf-access", id });
  }, []);

  const handleMapBackgroundClick = useCallback(
    (payload: { lon: number; lat: number }) => {
      setHoveredZone(null);
      setEstimatorOpen(false);
      setSearchOpen(false);
      const match = locateUserInZones(
        payload.lon,
        payload.lat,
        null,
        zones,
      );
      if (match.kind === "paid" || match.kind === "permit") {
        setMapContext({
          type: "zone",
          kind: match.kind,
          zoneRaw: match.zoneRaw,
          lon: payload.lon,
          lat: payload.lat,
        });
        return;
      }
      setMapContext({
        type: "point",
        lon: payload.lon,
        lat: payload.lat,
        kind: "outside",
        zoneRaw: null,
      });
    },
    [zones],
  );

  const handleZoneHoverChange = useCallback((hover: HoveredMapFeature | null) => {
    setHoveredZone(hover);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (mapContext == null) return;
      event.preventDefault();
      clearContext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearContext, mapContext, searchOpen]);

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
        onStadserfSelect={handleStadserfSelect}
        onStadserfAccessSelect={handleStadserfAccessSelect}
        garages={garages}
        stadserfBoundary={stadserfBoundary}
        destination={destinationPin}
        flyTo={flyTo}
        onMapBackgroundClick={handleMapBackgroundClick}
        recenterToken={recenterToken}
        activeZoneLabelKey={currentZoneLabelKey}
        selectedZoneKey={selectedZoneKey}
        hoverClearToken={hoverClearToken}
        stadserfSelected={
          mapContext?.type === "stadserf" || mapContext?.type === "stadserf-access"
        }
        stadserfCurrent={userInStadserf}
        selectedAccessId={
          mapContext?.type === "stadserf-access" ? mapContext.id : null
        }
        selectedGarageId={mapContext?.type === "garage" ? mapContext.garage.id : null}
        selectionActive={mapContext != null && mapContext.type !== "live"}
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
          hoveredZone={
            hoveredZone?.kind === "garage"
              ? {
                  kind: "garage",
                  garage:
                    garages.find((garage) => garage.id === hoveredZone.garage.id) ??
                    hoveredZone.garage,
                }
              : hoveredZone
          }
          userInStadserf={userInStadserf}
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
