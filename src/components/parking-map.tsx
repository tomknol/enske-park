"use client";

import {
  GeoJSONSource,
  Map as MaplibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import { buildZoneLabelPoints, ZONE_LABEL_FONT } from "@/lib/zone-labels";
import {
  zoneFillColor,
  zoneLineColor,
  type ZoneCollections,
} from "@/lib/zones";
import { formatGarageMarkerLabel, type GarageOccupancyLevel } from "@/lib/garages";
import { FREE_PARKING_SPOTS } from "@/lib/free-parking";
import { MAP_STYLE_URL } from "@/lib/map-theme";
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
  activeZoneLabelKey: string | null;
};

const DEFAULT_CENTER: [number, number] = [6.8937, 52.2215];
const MAPLIBRE_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@6.13.0/dist/maplibre-gl-worker.mjs";

/** Keep the map strictly 2D / north-up top view. */
const FLAT_CAMERA = { pitch: 0, bearing: 0 } as const;

const ZONE_LABEL_HALO_COLOR = "rgba(12, 16, 24, 0.55)";
const ZONE_LABEL_HALO_WIDTH: ExpressionSpecification = [
  "case",
  ["boolean", ["get", "emphasized"], false],
  2.8,
  2.2,
];

function applyFlatMapStyle(map: MaplibreMap) {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type === "fill-extrusion") {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

/** Slightly mute non-parking basemap detail so zones and markers stand out. */
function applyParkingFocusBasemap(map: MaplibreMap) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    if (layer.type === "symbol") {
      const isPoi = id.includes("poi") || id.includes("amenity") || id.includes("shop");
      if (isPoi) {
        try {
          map.setPaintProperty(layer.id, "text-opacity", 0.35);
          map.setPaintProperty(layer.id, "icon-opacity", 0.25);
        } catch {
          /* layer may not expose these paints */
        }
      }
    }
  }
}

const ZONE_LABEL_SIZE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0,
  12,
  ["case", ["boolean", ["get", "emphasized"], false], 26, 22],
  13.5,
  ["case", ["boolean", ["get", "emphasized"], false], 34, 28],
  15,
  ["case", ["boolean", ["get", "emphasized"], false], 44, 36],
  16.5,
  ["case", ["boolean", ["get", "emphasized"], false], 52, 44],
  18,
  ["case", ["boolean", ["get", "emphasized"], false], 58, 48],
];

const ZONE_LABEL_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["get", "emphasized"], false],
  0.88,
  0.62,
];

const GARAGE_COUNT_MIN_ZOOM = 14.25;
const FREE_MARKER_MIN_ZOOM = 13.25;

function syncGarageMarkerAppearance(el: HTMLButtonElement, g: GarageMarkerData, zoom: number) {
  const showCount =
    zoom >= GARAGE_COUNT_MIN_ZOOM && g.live && g.vacant != null && g.level !== "full";
  el.className = showCount ? "garage-map-marker" : "garage-map-marker garage-map-marker--compact";
  el.textContent = showCount ? `P ${g.vacant}` : "P";
  el.setAttribute(
    "aria-label",
    `${g.label}, ${g.live ? formatGarageMarkerLabel(g.level, g.vacant) : "Live bezetting onbekend"}`,
  );
}

function createGarageMarkerElement(g: GarageMarkerData, zoom: number): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  syncGarageMarkerAppearance(el, g, zoom);
  return el;
}

function applyZoneLabelLayerStyle(map: MaplibreMap) {
  if (!map.getLayer("zone-labels")) return;
  map.setLayoutProperty("zone-labels", "text-field", ["get", "label"]);
  map.setLayoutProperty("zone-labels", "text-font", [...ZONE_LABEL_FONT]);
  map.setLayoutProperty("zone-labels", "text-anchor", "center");
  map.setLayoutProperty("zone-labels", "text-allow-overlap", true);
  map.setLayoutProperty("zone-labels", "text-ignore-placement", true);
  map.setLayoutProperty("zone-labels", "text-optional", false);
  map.setLayoutProperty("zone-labels", "text-size", ZONE_LABEL_SIZE);
  map.setPaintProperty("zone-labels", "text-color", ["get", "textColor"]);
  map.setPaintProperty("zone-labels", "text-halo-color", ZONE_LABEL_HALO_COLOR);
  map.setPaintProperty("zone-labels", "text-halo-width", ZONE_LABEL_HALO_WIDTH);
  map.setPaintProperty("zone-labels", "text-opacity", ZONE_LABEL_OPACITY);
}

function enrichCollections(zones: ZoneCollections) {
  const paid: FeatureCollection = {
    type: "FeatureCollection",
    features: zones.paid.features.map((f) => ({
      ...f,
      properties: {
        ...f.properties,
        fill: zoneFillColor(f.properties?.ZONE ?? null, "paid"),
        line: zoneLineColor(f.properties?.ZONE ?? null, "paid"),
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
  activeZoneLabelKey,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const garageMarkersRef = useRef<Marker[]>([]);
  const freeMarkersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const accuracySourceId = "user-accuracy";
  const zoneHandlersBound = useRef(false);
  const hasCenteredOnUser = useRef(false);
  const labelPointsRef = useRef<FeatureCollection | null>(null);
  const zonesAppliedRef = useRef<ZoneCollections | null>(null);
  const onUserMovedMapRef = useRef(onUserMovedMap);
  const onZoneSelectRef = useRef(onZoneSelect);
  const onGarageSelectRef = useRef(onGarageSelect);
  const onFreeSelectRef = useRef(onFreeSelect);
  const activeZoneLabelKeyRef = useRef(activeZoneLabelKey);
  const garagesVisualKeyRef = useRef("");
  const garageMarkerElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const garageByIdRef = useRef<Map<string, GarageMarkerData>>(new Map());
  const freeMarkerElsRef = useRef<HTMLButtonElement[]>([]);
  const mapZoomRef = useRef(14);

  useEffect(() => {
    onUserMovedMapRef.current = onUserMovedMap;
    onZoneSelectRef.current = onZoneSelect;
    onGarageSelectRef.current = onGarageSelect;
    onFreeSelectRef.current = onFreeSelect;
    activeZoneLabelKeyRef.current = activeZoneLabelKey;
  }, [
    onUserMovedMap,
    onZoneSelect,
    onGarageSelect,
    onFreeSelect,
    activeZoneLabelKey,
  ]);

  const syncLabelEmphasis = (map: MaplibreMap, activeKey: string | null) => {
    const sourceId = "zone-label-points";
    const base = labelPointsRef.current;
    if (!map.getSource(sourceId) || !base) return;

    const next: FeatureCollection = {
      type: "FeatureCollection",
      features: base.features.map((feature) => {
        const zoneKey = feature.properties?.zoneKey as string | undefined;
        const emphasized = activeKey != null && zoneKey === activeKey;
        return {
          ...feature,
          properties: {
            ...feature.properties,
            emphasized,
          },
        };
      }),
    };
    labelPointsRef.current = next;
    (map.getSource(sourceId) as GeoJSONSource).setData(next);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new MaplibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 14,
      attributionControl: { compact: true },
      ...FLAT_CAMERA,
      maxPitch: 0,
      minPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });

    if (window.matchMedia("(pointer: fine)").matches) {
      map.addControl(
        new NavigationControl({ showCompass: false, visualizePitch: false }),
        "bottom-right",
      );
    }

    const onZoom = () => {
      mapZoomRef.current = map.getZoom();
      garageMarkerElsRef.current.forEach((el, id) => {
        const g = garageByIdRef.current.get(id);
        if (g) syncGarageMarkerAppearance(el, g, mapZoomRef.current);
      });
      const showFree = mapZoomRef.current >= FREE_MARKER_MIN_ZOOM;
      for (const el of freeMarkerElsRef.current) {
        el.classList.toggle("free-map-marker--hidden", !showFree);
      }
    };
    map.on("zoom", onZoom);
    map.on("load", onZoom);

    map.touchZoomRotate.disableRotation();
    map.on("load", () => {
      applyFlatMapStyle(map);
      applyParkingFocusBasemap(map);
    });
    map.on("pitch", () => {
      if (map.getPitch() !== 0) map.setPitch(0);
    });

    map.on("dragstart", () => onUserMovedMapRef.current());

    mapRef.current = map;

    return () => {
      map.off("zoom", onZoom);
      map.remove();
      mapRef.current = null;
      zoneHandlersBound.current = false;
      hasCenteredOnUser.current = false;
      zonesAppliedRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zones) return;
    if (zonesAppliedRef.current === zones) return;
    zonesAppliedRef.current = zones;

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
              "fill-opacity": 0.38,
            },
          });
          map.addLayer({
            id: `${id}-line`,
            type: "line",
            source: id,
            paint: {
              "line-color": ["get", "line"],
              "line-width": 1,
            },
          });
        }
        if (map.getLayer(`${id}-label`)) {
          map.removeLayer(`${id}-label`);
        }
      }

      const labelPoints = buildZoneLabelPoints(zones);
      labelPointsRef.current = labelPoints;

      if (map.getSource("zone-label-points")) {
        (map.getSource("zone-label-points") as GeoJSONSource).setData(labelPoints);
        applyZoneLabelLayerStyle(map);
      } else {
        map.addSource("zone-label-points", {
          type: "geojson",
          data: labelPoints,
          promoteId: "labelId",
        });
        map.addLayer({
          id: "zone-labels",
          type: "symbol",
          source: "zone-label-points",
          minzoom: 11,
          layout: {
            "text-field": ["get", "label"],
            "text-font": [...ZONE_LABEL_FONT],
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-optional": false,
            "text-size": ZONE_LABEL_SIZE,
          },
          paint: {
            "text-color": ["get", "textColor"],
            "text-halo-color": ZONE_LABEL_HALO_COLOR,
            "text-halo-width": ZONE_LABEL_HALO_WIDTH,
            "text-opacity": ZONE_LABEL_OPACITY,
          },
        });
      }

      syncLabelEmphasis(map, activeZoneLabelKeyRef.current);

      if (!zoneHandlersBound.current) {
        zoneHandlersBound.current = true;

        const onZoneLayerActivate = (e: { features?: MapGeoJSONFeature[] }) => {
          const f = e.features?.[0];
          if (!f) return;
          const layerId = f.layer?.id ?? "";
          const kind = layerId.startsWith("permit") ? "permit" : "paid";
          onZoneSelectRef.current({
            kind,
            zoneRaw: (f.properties?.ZONE as string) ?? null,
            gebiedCod: (f.properties?.GEBIED_COD as string) ?? null,
          });
        };

        map.on("click", "paid-zones-fill", onZoneLayerActivate);
        map.on("click", "permit-zones-fill", onZoneLayerActivate);
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
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zones) return;
    syncLabelEmphasis(map, activeZoneLabelKey);
  }, [activeZoneLabelKey, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    const { lon, lat, accuracy } = position;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "map-user-dot";
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
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.18 },
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
      map.easeTo({ center: [lon, lat], zoom: 16, duration: 600, ...FLAT_CAMERA });
      hasCenteredOnUser.current = true;
    }
  }, [position]);

  useEffect(() => {
    if (followUser && position && mapRef.current) {
      mapRef.current.easeTo({
        center: [position.lon, position.lat],
        zoom: 16,
        duration: 700,
        ...FLAT_CAMERA,
      });
    }
  }, [followUser, position, recenterToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const visualKey = garages
      .map((g) => `${g.id}:${g.live}:${g.level}:${g.vacant ?? "x"}`)
      .join("|");
    if (visualKey === garagesVisualKeyRef.current) return;
    garagesVisualKeyRef.current = visualKey;

    garageMarkersRef.current.forEach((m) => m.remove());
    garageMarkersRef.current = [];
    garageMarkerElsRef.current.clear();
    garageByIdRef.current.clear();

    garages.forEach((g) => {
      if (g.lat == null || g.lon == null) return;
      const el = createGarageMarkerElement(g, mapZoomRef.current);
      garageMarkerElsRef.current.set(g.id, el);
      garageByIdRef.current.set(g.id, g);

      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([g.lon, g.lat])
        .addTo(map);
      const openGarage = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        onGarageSelectRef.current(g);
      };
      el.addEventListener("click", openGarage);
      el.addEventListener("touchend", openGarage, { passive: false });
      garageMarkersRef.current.push(marker);
    });
  }, [garages]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    freeMarkersRef.current.forEach((m) => m.remove());
    freeMarkersRef.current = [];
    freeMarkerElsRef.current = [];

    FREE_PARKING_SPOTS.forEach((spot) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "free-map-marker";
      if (mapZoomRef.current < FREE_MARKER_MIN_ZOOM) {
        el.classList.add("free-map-marker--hidden");
      }
      el.textContent = "€0";
      freeMarkerElsRef.current.push(el);
      el.setAttribute("aria-label", `Gratis parkeren ${spot.name}`);
      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([spot.lon, spot.lat])
        .addTo(map);
      const openFree = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        onFreeSelectRef.current(spot.id);
      };
      el.addEventListener("click", openFree);
      el.addEventListener("touchend", openFree, { passive: false });
      freeMarkersRef.current.push(marker);
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full touch-pan-x touch-pan-y"
      aria-label="Kaart Enschede"
    />
  );
}
