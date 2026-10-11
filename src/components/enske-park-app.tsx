"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { Crosshair, Info } from "lucide-react";
import {
  ParkingContextPanel,
  type SelectedMapFeature,
} from "@/components/parking-context-panel";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useStableUserZone } from "@/hooks/use-stable-user-zone";
import { isRelevantGermanHoliday } from "@/lib/holidays-de";
import { resolveParkingAtLocation } from "@/lib/parking-status";
import { activeZoneLabelKey, zoneCollectionKey } from "@/lib/zone-labels";
import { locateUserInZones, type ZoneCollections } from "@/lib/zones";

const ParkingMap = dynamic(
  () => import("@/components/parking-map").then((m) => m.ParkingMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-shell absolute inset-0" aria-hidden />
    ),
  },
);

export function EnskeParkApp() {
  const { state: geoState, retry: retryGeo } = useGeolocation();
  const [zones, setZones] = useState<ZoneCollections | null>(null);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zonesError, setZonesError] = useState(false);

  const [followUser, setFollowUser] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [selectedMapFeature, setSelectedMapFeature] = useState<SelectedMapFeature | null>(
    null,
  );
  const [hoveredZone, setHoveredZone] = useState<{
    kind: "paid" | "permit";
    zoneRaw: string | null;
  } | null>(null);
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
    } catch {
      setZonesError(true);
      setZones(null);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadZones(), 0);
    return () => window.clearTimeout(t);
  }, [loadZones]);

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
    const s = selectedMapFeature;
    if (!s || s.type !== "zone") return null;
    return zoneCollectionKey(s.kind, s.zoneRaw);
  }, [selectedMapFeature]);

  const snapshot = useMemo(
    () => resolveParkingAtLocation(userZone.kind, userZone.zoneRaw, clock ?? undefined),
    [userZone.kind, userZone.zoneRaw, clock],
  );

  const amsterdamToday = toZonedTime(clock ?? new Date(0), "Europe/Amsterdam");
  const germanHoliday = isRelevantGermanHoliday(amsterdamToday);

  const clearSelection = useCallback(() => setSelectedMapFeature(null), []);

  const handleUserMovedMap = useCallback(() => setFollowUser(false), []);
  const handleZoneSelect = useCallback(
    (payload: {
      kind: "paid" | "permit";
      zoneRaw: string | null;
      gebiedCod: string | null;
    }) => {
      setSelectedMapFeature({
        type: "zone",
        kind: payload.kind,
        zoneRaw: payload.zoneRaw,
      });
    },
    [],
  );
  const handleMapBackgroundClick = useCallback(() => {
    setHoveredZone(null);
    setSelectedMapFeature((current) => (current ? null : current));
  }, []);

  const handleZoneHoverChange = useCallback(
    (zone: { kind: "paid" | "permit"; zoneRaw: string | null } | null) => {
      setHoveredZone(zone);
    },
    [],
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--background)]">
      <div className="map-vignette pointer-events-none absolute inset-0 z-[1]" aria-hidden />
      <ParkingMap
        zones={zones}
        position={position}
        followUser={followUser}
        onUserMovedMap={handleUserMovedMap}
        onZoneSelect={handleZoneSelect}
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
          selected={selectedMapFeature}
          hoveredZone={hoveredZone}
          onClearSelection={clearSelection}
          clock={clock ?? undefined}
        />
      </div>

      <div
        className="map-attribution pointer-events-none absolute z-10"
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
        className="map-controls absolute z-20"
        style={{
          right: "max(12px, env(safe-area-inset-right))",
          bottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="map-control-dock">
          {!selectedMapFeature && (
            <button
              type="button"
              className="map-float-btn"
              aria-label="Over Enske Park"
              onClick={() => setSelectedMapFeature({ type: "info" })}
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
