"use client";

import {
  GeoJSONSource,
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import {
  zoneFillColor,
  zoneLineColor,
  zoneDisplayName,
  type ZoneCollections,
} from "@/lib/zones";
import {
  formatGarageMarkerLabel,
  occupancyColors,
  type GarageOccupancyLevel,
} from "@/lib/garages";
import { FREE_PARKING_SPOTS } from "@/lib/free-parking";
import type { GeoPosition } from "@/hooks/use-geolocation";

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

type ParkingMapProps = {
  zones: ZoneCollections | null;
  position: GeoPosition | null;
  followUser: boolean;
  onUserMovedMap: () => void;
  garages: GarageMarkerData[];
  onZoneSelect: (payload: {
    kind: "paid" | "permit";
    zoneRaw: string | null;
    gebiedCod: string | null;
  }) => void;
  onGarageSelect: (garage: GarageMarkerData) => void;
  onFreeSelect: (spotId: string) => void;
  recenterToken: number;
};

const DEFAULT_CENTER: [number, number] = [6.8937, 52.2215];
const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
  "https://tiles.openfreemap.org/styles/liberty";
const MAPLIBRE_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@6.13.0/dist/maplibre-gl-worker.mjs";

function enrichCollections(zones: ZoneCollections) {
  const paid: FeatureCollection = {
    type: "FeatureCollection",
    features: zones.paid.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        fill: zoneFillColor(f.properties?.ZONE ?? null, "paid"),
        line: zoneLineColor(f.properties?.ZONE ?? null, "paid"),
        label: zoneDisplayName(f.properties?.ZONE ?? null),
      },
    })),
  };
  const permit: FeatureCollection = {
    type: "FeatureCollection",
    features: zones.permit.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        fill: zoneFillColor(f.properties?.ZONE ?? null, "permit"),
        line: zoneLineColor(f.properties?.ZONE ?? null, "permit"),
        label: "Vergunning",
      },
    })),
  };
  return { paid, permit };
}

export function ParkingMap({
  zones,
  position,
  followUser,
  onUserMovedMap,
  garages,
  onZoneSelect,
  onGarageSelect,
  onFreeSelect,
  recenterToken,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const garageMarkersRef = useRef<Marker[]>([]);
  const freeMarkersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const accuracySourceId = "user-accuracy";
  const zoneHandlersBound = useRef(false);
  const hasCenteredOnUser = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 14,
      attributionControl: { compact: true },
      pitch: 0,
    });

    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    map.on("dragstart", () => onUserMovedMap());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onUserMovedMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zones) return;

    const apply = () => {
      const { paid, permit } = enrichCollections(zones);

      for (const [id, data] of [
        ["paid-zones", paid],
        ["permit-zones", permit],
      ] as const) {
        if (map.getSource(id)) {
          (map.getSource(id) as GeoJSONSource).setData(data);
        } else {
          map.addSource(id, { type: "geojson", data });
          map.addLayer({
            id: `${id}-fill`,
            type: "fill",
            source: id,
            paint: {
              "fill-color": ["get", "fill"],
              "fill-opacity": 0.45,
            },
          });
          map.addLayer({
            id: `${id}-line`,
            type: "line",
            source: id,
            paint: {
              "line-color": ["get", "line"],
              "line-width": 1.5,
            },
          });
          map.addLayer({
            id: `${id}-label`,
            type: "symbol",
            source: id,
            minzoom: 15.5,
            layout: {
              "text-field": ["get", "label"],
              "text-size": 12,
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            },
            paint: {
              "text-color": "#334155",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2,
            },
          });
        }
      }

      if (!zoneHandlersBound.current) {
        zoneHandlersBound.current = true;
        map.on("click", (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ["paid-zones-fill", "permit-zones-fill"],
          });
          const f = features[0];
          if (!f) return;
          const layer = f.layer.id.startsWith("permit") ? "permit" : "paid";
          onZoneSelect({
            kind: layer,
            zoneRaw: (f.properties?.ZONE as string) ?? null,
            gebiedCod: (f.properties?.GEBIED_COD as string) ?? null,
          });
        });
        map.on("mouseenter", "paid-zones-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "paid-zones-fill", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "permit-zones-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "permit-zones-fill", () => {
          map.getCanvas().style.cursor = "";
        });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [zones, onZoneSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    const { lon, lat, accuracy } = position;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full border-2 border-white bg-sky-500 shadow-md";
      userMarkerRef.current = new Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([lon, lat]);
    }

    const circle = {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [lon, lat],
      },
      properties: {},
    };

    const radiusM = Math.min(Math.max(accuracy, 8), 80);
    const latRad = (lat * Math.PI) / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos(latRad);
    const dLat = radiusM / metersPerDegLat;
    const dLon = radiusM / metersPerDegLon;
    const ring = {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          Array.from({ length: 64 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2;
            return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
          }),
        ],
      },
      properties: {},
    };

    const upsert = () => {
      if (!map.getSource(accuracySourceId)) {
        map.addSource(accuracySourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [circle, ring] },
        });
        map.addLayer({
          id: "user-accuracy-fill",
          type: "fill",
          source: accuracySourceId,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "user-accuracy-point",
          type: "circle",
          source: accuracySourceId,
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": 0 },
        });
      } else {
        (map.getSource(accuracySourceId) as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: [circle, ring],
        });
      }
    };

    if (map.isStyleLoaded()) upsert();
    else map.once("load", upsert);

    if (!hasCenteredOnUser.current) {
      map.easeTo({ center: [lon, lat], zoom: 16, duration: 600 });
      hasCenteredOnUser.current = true;
    }
  }, [position]);

  useEffect(() => {
    if (followUser && position && mapRef.current) {
      mapRef.current.easeTo({
        center: [position.lon, position.lat],
        zoom: 16,
        duration: 700,
      });
    }
  }, [followUser, position, recenterToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    garageMarkersRef.current.forEach((m) => m.remove());
    garageMarkersRef.current = [];

    garages.forEach((g) => {
      if (g.lat == null || g.lon == null) return;
      const colors = occupancyColors(g.level);
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "min-h-11 min-w-11 rounded-lg px-2 py-1.5 text-[10px] font-bold leading-tight shadow-md ring-1 transition-transform active:scale-95";
      el.style.background = colors.bg;
      el.style.color = colors.text;
      el.style.borderColor = colors.border;
      el.setAttribute(
        "aria-label",
        `${g.label}, ${g.live ? formatGarageMarkerLabel(g.level, g.vacant) : "Live bezetting onbekend"}`,
      );
      el.textContent = g.live
        ? `${g.shortLabel}\n${formatGarageMarkerLabel(g.level, g.vacant).replace("P ", "")}`
        : `${g.shortLabel}\n?`;
      el.style.whiteSpace = "pre-line";
      el.style.textAlign = "center";

      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([g.lon, g.lat])
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onGarageSelect(g);
      });
      garageMarkersRef.current.push(marker);
    });
  }, [garages, onGarageSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    freeMarkersRef.current.forEach((m) => m.remove());
    freeMarkersRef.current = [];

    FREE_PARKING_SPOTS.forEach((spot) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "flex min-h-11 min-w-11 items-center justify-center rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white shadow-md ring-2 ring-white active:scale-95";
      el.textContent = "€0";
      el.setAttribute("aria-label", `Gratis parkeren ${spot.name}`);
      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([spot.lon, spot.lat])
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onFreeSelect(spot.id);
      });
      freeMarkersRef.current.push(marker);
    });
  }, [onFreeSelect]);

  return (
    <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label="Kaart Enschede" />
  );
}
