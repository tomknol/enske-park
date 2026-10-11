"use client";

import {
  GeoJSONSource,
  Map as MaplibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import {
  buildZoneLabelPoints,
  parseZoneCollectionKey,
  ZONE_LABEL_FONT,
} from "@/lib/zone-labels";
import type { ZoneCollections } from "@/lib/zones";
import {
  computeZoneFeatureState,
  enrichZoneCollections,
  PERMIT_FILL_OPACITY,
  PERMIT_LINE_OPACITY,
  PERMIT_LINE_WIDTH,
  ZONE_FILL_OPACITY,
  ZONE_LINE_OPACITY,
  ZONE_LINE_WIDTH,
  ZONE_HOVER_TRANSITION,
  ZONE_PAINT_TRANSITION,
  type ZoneSourceId,
  type ZoneStateTarget,
} from "@/lib/zone-map-highlight";
import type { GarageMarkerData } from "@/lib/garages";
import {
  createDestinationMarkerElement,
  createGarageMarkerElement,
  createPnrMarkerElement,
  syncGarageMarkerAppearance,
} from "@/lib/map-markers";
import { MAP_STYLE_URL } from "@/lib/map-theme";
import { PNR_ZUIDERVAL } from "@/lib/pnr-zuiderval";
import type { GeoPosition } from "@/hooks/use-geolocation";

export type { GarageMarkerData };

type ParkingMapProps = {
  zones: ZoneCollections | null;
  position: GeoPosition | null;
  followUser: boolean;
  onUserMovedMap: () => void;
  onZoneSelect: (payload: {
    kind: "paid" | "permit";
    zoneRaw: string | null;
    gebiedCod: string | null;
  }) => void;
  onGarageSelect: (garage: GarageMarkerData) => void;
  onPnrSelect: () => void;
  garages: GarageMarkerData[];
  stadserfBoundary: FeatureCollection | null;
  destination: { lon: number; lat: number } | null;
  flyTo: { lon: number; lat: number; token: number } | null;
  onMapBackgroundClick: () => void;
  recenterToken: number;
  activeZoneLabelKey: string | null;
  selectedZoneKey: string | null;
  onZoneHoverChange?: (
    zone: { kind: "paid" | "permit"; zoneRaw: string | null } | null,
  ) => void;
};

const ZONE_CLICK_LAYERS = ["paid-zones-fill", "permit-zones-fill"] as const;

const DESKTOP_ZONE_HOVER =
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const DEFAULT_CENTER: [number, number] = [6.8937, 52.2215];
const MAPLIBRE_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/maplibre-gl@6.13.0/dist/maplibre-gl-worker.mjs";

/** Keep the map strictly 2D / north-up top view. */
const FLAT_CAMERA = { pitch: 0, bearing: 0 } as const;

const ZONE_LABEL_HALO_COLOR = "rgba(8, 10, 14, 0.62)";

const PERMIT_LABEL_MIN_ZOOM = 14.75;

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
      const isRoadLabel =
        id.includes("road") || id.includes("street") || id.includes("highway");
      try {
        if (isPoi) {
          map.setPaintProperty(layer.id, "text-opacity", 0.26);
          map.setPaintProperty(layer.id, "icon-opacity", 0.18);
        } else if (isRoadLabel) {
          map.setPaintProperty(layer.id, "text-opacity", 0.48);
        }
      } catch {
        /* layer may not expose these paints */
      }
    }
  }
}

const PAID_ZONE_LABEL_SIZE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0,
  12,
  ["case", ["boolean", ["get", "emphasized"], false], 34, 28],
  13.5,
  ["case", ["boolean", ["get", "emphasized"], false], 46, 38],
  15,
  ["case", ["boolean", ["get", "emphasized"], false], 58, 48],
  16.5,
  ["case", ["boolean", ["get", "emphasized"], false], 68, 58],
  18,
  ["case", ["boolean", ["get", "emphasized"], false], 78, 66],
];

const PERMIT_ZONE_LABEL_SIZE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  PERMIT_LABEL_MIN_ZOOM,
  0,
  PERMIT_LABEL_MIN_ZOOM + 0.5,
  11,
  16,
  12,
];

const PAID_ZONE_LABEL_OPACITY: ExpressionSpecification = [
  "case",
  ["boolean", ["get", "emphasized"], false],
  0.9,
  ["boolean", ["get", "labelSelected"], false],
  0.78,
  ["boolean", ["get", "labelHover"], false],
  0.72,
  0.62,
];

const PAID_ZONE_LABEL_HALO_WIDTH: ExpressionSpecification = [
  "case",
  ["boolean", ["get", "emphasized"], false],
  2.8,
  ["boolean", ["get", "labelHover"], false],
  2.35,
  2,
];

const PERMIT_ZONE_LABEL_OPACITY = 0.42;

const ZONE_LABEL_HALO_COLOR_ACTIVE = "rgba(255, 255, 255, 0.16)";

function stylePaidZoneLabels(map: MaplibreMap) {
  const id = "zone-labels-paid";
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "text-field", ["get", "label"]);
  map.setLayoutProperty(id, "text-font", [...ZONE_LABEL_FONT]);
  map.setLayoutProperty(id, "text-size", PAID_ZONE_LABEL_SIZE);
  map.setPaintProperty(id, "text-color", ["get", "textColor"]);
  map.setPaintProperty(id, "text-halo-color", [
    "case",
    ["boolean", ["get", "emphasized"], false],
    ZONE_LABEL_HALO_COLOR_ACTIVE,
    ZONE_LABEL_HALO_COLOR,
  ]);
  map.setPaintProperty(id, "text-halo-width", PAID_ZONE_LABEL_HALO_WIDTH);
  map.setPaintProperty(id, "text-opacity", PAID_ZONE_LABEL_OPACITY);
}

function stylePermitZoneLabels(map: MaplibreMap) {
  const id = "zone-labels-permit";
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "text-field", ["get", "label"]);
  map.setLayoutProperty(id, "text-font", [...ZONE_LABEL_FONT]);
  map.setLayoutProperty(id, "text-size", PERMIT_ZONE_LABEL_SIZE);
  map.setPaintProperty(id, "text-color", ["get", "textColor"]);
  map.setPaintProperty(id, "text-halo-color", ZONE_LABEL_HALO_COLOR);
  map.setPaintProperty(id, "text-halo-width", 1.4);
  map.setPaintProperty(id, "text-opacity", PERMIT_ZONE_LABEL_OPACITY);
}

function applyZoneLabelLayerStyle(map: MaplibreMap) {
  stylePaidZoneLabels(map);
  stylePermitZoneLabels(map);
}

function removeLegacyLabelLayer(map: MaplibreMap) {
  if (map.getLayer("zone-labels")) map.removeLayer("zone-labels");
}

function ensureZoneLabelLayers(map: MaplibreMap, data: FeatureCollection) {
  removeLegacyLabelLayer(map);

  if (!map.getSource("zone-label-points")) {
    map.addSource("zone-label-points", {
      type: "geojson",
      data,
      promoteId: "labelId",
    });
  }

  if (!map.getLayer("zone-labels-paid")) {
    map.addLayer({
      id: "zone-labels-paid",
      type: "symbol",
      source: "zone-label-points",
      minzoom: 11,
      filter: ["==", ["get", "layer"], "paid"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": [...ZONE_LABEL_FONT],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": false,
        "text-size": PAID_ZONE_LABEL_SIZE,
      },
      paint: {
        "text-color": ["get", "textColor"],
        "text-halo-color": ZONE_LABEL_HALO_COLOR,
        "text-halo-width": PAID_ZONE_LABEL_HALO_WIDTH,
        "text-opacity": PAID_ZONE_LABEL_OPACITY,
      },
    });
  }

  if (!map.getLayer("zone-labels-permit")) {
    map.addLayer({
      id: "zone-labels-permit",
      type: "symbol",
      source: "zone-label-points",
      minzoom: PERMIT_LABEL_MIN_ZOOM,
      filter: ["==", ["get", "layer"], "permit"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": [...ZONE_LABEL_FONT],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": false,
        "text-size": PERMIT_ZONE_LABEL_SIZE,
      },
      paint: {
        "text-color": ["get", "textColor"],
        "text-halo-color": ZONE_LABEL_HALO_COLOR,
        "text-halo-width": 1.4,
        "text-opacity": PERMIT_ZONE_LABEL_OPACITY,
      },
    });
  }
}

function removeLegacyHighlightLayers(map: MaplibreMap, sourceId: ZoneSourceId) {
  for (const id of [`${sourceId}-active-halo`, `${sourceId}-active-lift`] as const) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
}

function ensureZoneHighlightLayers(map: MaplibreMap, sourceId: ZoneSourceId) {
  const lineId = `${sourceId}-line`;
  const currentEdgeId = `${sourceId}-current-edge`;
  const selectedEdgeId = `${sourceId}-selected-edge`;

  removeLegacyHighlightLayers(map, sourceId);

  if (!map.getLayer(currentEdgeId) && map.getSource(sourceId)) {
    map.addLayer(
      {
        id: currentEdgeId,
        type: "line",
        source: sourceId,
        filter: ["==", ["feature-state", "current"], true],
        paint: {
          "line-color": ["get", "line"],
          "line-width": sourceId === "permit-zones" ? 4 : 4.5,
          "line-opacity": sourceId === "permit-zones" ? 0.08 : 0.1,
          "line-blur": 1,
          "line-width-transition": ZONE_PAINT_TRANSITION,
          "line-opacity-transition": ZONE_PAINT_TRANSITION,
        },
      },
      lineId,
    );
  }

  if (!map.getLayer(selectedEdgeId) && map.getSource(sourceId)) {
    map.addLayer(
      {
        id: selectedEdgeId,
        type: "line",
        source: sourceId,
        filter: [
          "all",
          ["==", ["feature-state", "selected"], true],
          ["!=", ["feature-state", "current"], true],
        ],
        paint: {
          "line-color": "rgba(198, 208, 222, 0.65)",
          "line-width": 1.5,
          "line-opacity": 0.45,
          "line-dasharray": [2, 2.5],
        },
      },
      lineId,
    );
  }
}

function applyZoneLayerPaint(map: MaplibreMap, sourceId: ZoneSourceId) {
  const fillId = `${sourceId}-fill`;
  const lineId = `${sourceId}-line`;
  const isPermit = sourceId === "permit-zones";
  if (map.getLayer(fillId)) {
    map.setPaintProperty(
      fillId,
      "fill-opacity",
      isPermit ? PERMIT_FILL_OPACITY : ZONE_FILL_OPACITY,
    );
    map.setPaintProperty(fillId, "fill-opacity-transition", ZONE_HOVER_TRANSITION);
  }
  if (map.getLayer(lineId)) {
    map.setPaintProperty(
      lineId,
      "line-width",
      isPermit ? PERMIT_LINE_WIDTH : ZONE_LINE_WIDTH,
    );
    map.setPaintProperty(
      lineId,
      "line-opacity",
      isPermit ? PERMIT_LINE_OPACITY : ZONE_LINE_OPACITY,
    );
    map.setPaintProperty(lineId, "line-width-transition", ZONE_HOVER_TRANSITION);
    map.setPaintProperty(lineId, "line-opacity-transition", ZONE_HOVER_TRANSITION);
  }
  ensureZoneHighlightLayers(map, sourceId);
}

function syncZoneFeatureStates(
  map: MaplibreMap,
  targets: ZoneStateTarget[],
  currentKey: string | null,
  selectedKey: string | null,
  hoveredZoneKey: string | null,
) {
  for (const { sourceId, stateId, zoneKey } of targets) {
    const state = computeZoneFeatureState(
      zoneKey,
      currentKey,
      selectedKey,
      hoveredZoneKey,
    );
    map.setFeatureState({ source: sourceId, id: stateId }, state);
  }
}

function syncLabelVisualState(
  map: MaplibreMap,
  base: FeatureCollection | null,
  currentKey: string | null,
  selectedKey: string | null,
  hoveredZoneKey: string | null,
) {
  const sourceId = "zone-label-points";
  if (!map.getSource(sourceId) || !base) return;

  const next: FeatureCollection = {
    type: "FeatureCollection",
    features: base.features.map((feature) => {
      const zoneKey = feature.properties?.zoneKey as string | undefined;
      const emphasized = currentKey != null && zoneKey === currentKey;
      const labelSelected =
        !emphasized && selectedKey != null && zoneKey === selectedKey;
      const labelHover =
        !emphasized &&
        !labelSelected &&
        hoveredZoneKey != null &&
        zoneKey === hoveredZoneKey;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          emphasized,
          labelSelected,
          labelHover,
        },
      };
    }),
  };
  (map.getSource(sourceId) as GeoJSONSource).setData(next);
}

export function ParkingMap({
  zones,
  position,
  followUser,
  onUserMovedMap,
  onZoneSelect,
  onGarageSelect,
  onPnrSelect,
  garages,
  stadserfBoundary,
  destination,
  flyTo,
  onMapBackgroundClick,
  recenterToken,
  activeZoneLabelKey,
  selectedZoneKey,
  onZoneHoverChange,
}: ParkingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const garageMarkersRef = useRef<Marker[]>([]);
  const pnrMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const accuracySourceId = "user-accuracy";
  const zoneHandlersBound = useRef(false);
  const hasCenteredOnUser = useRef(false);
  const labelPointsRef = useRef<FeatureCollection | null>(null);
  const zonesAppliedRef = useRef<ZoneCollections | null>(null);
  const onUserMovedMapRef = useRef(onUserMovedMap);
  const onZoneSelectRef = useRef(onZoneSelect);
  const onGarageSelectRef = useRef(onGarageSelect);
  const onPnrSelectRef = useRef(onPnrSelect);
  const onMapBackgroundClickRef = useRef(onMapBackgroundClick);
  const garageMarkerElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const garageByIdRef = useRef<Map<string, GarageMarkerData>>(new Map());
  const garagesVisualKeyRef = useRef("");
  const mapZoomRef = useRef(14);
  const onZoneHoverChangeRef = useRef(onZoneHoverChange);
  const activeZoneLabelKeyRef = useRef(activeZoneLabelKey);
  const selectedZoneKeyRef = useRef(selectedZoneKey);
  const zoneStateTargetsRef = useRef<ZoneStateTarget[]>([]);
  const hoveredZoneKeyRef = useRef<string | null>(null);
  const labelBaseRef = useRef<FeatureCollection | null>(null);
  const zoneHoverHandlersBound = useRef(false);
  const mapBackgroundClickBound = useRef(false);
  useEffect(() => {
    onUserMovedMapRef.current = onUserMovedMap;
    onZoneSelectRef.current = onZoneSelect;
    onGarageSelectRef.current = onGarageSelect;
    onPnrSelectRef.current = onPnrSelect;
    onMapBackgroundClickRef.current = onMapBackgroundClick;
    onZoneHoverChangeRef.current = onZoneHoverChange;
    activeZoneLabelKeyRef.current = activeZoneLabelKey;
    selectedZoneKeyRef.current = selectedZoneKey;
  }, [
    onUserMovedMap,
    onZoneSelect,
    onGarageSelect,
    onPnrSelect,
    onMapBackgroundClick,
    onZoneHoverChange,
    activeZoneLabelKey,
    selectedZoneKey,
  ]);

  const syncAllZoneVisualState = (map: MaplibreMap) => {
    syncZoneFeatureStates(
      map,
      zoneStateTargetsRef.current,
      activeZoneLabelKeyRef.current,
      selectedZoneKeyRef.current,
      hoveredZoneKeyRef.current,
    );
    syncLabelVisualState(
      map,
      labelBaseRef.current,
      activeZoneLabelKeyRef.current,
      selectedZoneKeyRef.current,
      hoveredZoneKeyRef.current,
    );
  };

  const notifyZoneHover = (zoneKey: string | null) => {
    const cb = onZoneHoverChangeRef.current;
    if (!cb) return;
    if (!zoneKey) {
      cb(null);
      return;
    }
    const parsed = parseZoneCollectionKey(zoneKey);
    if (!parsed) {
      cb(null);
      return;
    }
    cb({ kind: parsed.kind, zoneRaw: parsed.zoneRaw });
  };

  const setHoveredZoneKey = (map: MaplibreMap, zoneKey: string | null) => {
    if (hoveredZoneKeyRef.current === zoneKey) return;
    hoveredZoneKeyRef.current = zoneKey;
    syncAllZoneVisualState(map);
    notifyZoneHover(zoneKey);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setWorkerUrl(MAPLIBRE_WORKER_URL);

    const map = new MaplibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 14,
      attributionControl: false,
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

    map.on("dragstart", () => {
      onUserMovedMapRef.current();
      setHoveredZoneKey(map, null);
    });

    mapRef.current = map;

    return () => {
      map.off("zoom", onZoom);
      map.remove();
      mapRef.current = null;
      zoneHandlersBound.current = false;
      zoneHoverHandlersBound.current = false;
      hoveredZoneKeyRef.current = null;
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
      const enriched = enrichZoneCollections(zones);
      zoneStateTargetsRef.current = enriched.stateTargets;

      for (const [id, data] of [
        ["permit-zones", enriched.permit],
        ["paid-zones", enriched.paid],
      ] as const) {
        if (map.getSource(id)) {
          (map.getSource(id) as GeoJSONSource).setData(data);
          applyZoneLayerPaint(map, id);
        } else {
          map.addSource(id, { type: "geojson", data, promoteId: "stateId" });
          map.addLayer({
            id: `${id}-fill`,
            type: "fill",
            source: id,
            paint: {
              "fill-color": ["get", "fill"],
              "fill-opacity": ZONE_FILL_OPACITY,
            },
          });
          map.addLayer({
            id: `${id}-line`,
            type: "line",
            source: id,
            paint: {
              "line-color": ["get", "line"],
              "line-width": ZONE_LINE_WIDTH,
              "line-opacity": ZONE_LINE_OPACITY,
            },
          });
          applyZoneLayerPaint(map, id);
        }
        if (map.getLayer(`${id}-label`)) {
          map.removeLayer(`${id}-label`);
        }
      }

      const labelPoints = buildZoneLabelPoints(zones);
      labelPointsRef.current = labelPoints;
      labelBaseRef.current = labelPoints;
      hoveredZoneKeyRef.current = null;
      notifyZoneHover(null);

      if (map.getSource("zone-label-points")) {
        (map.getSource("zone-label-points") as GeoJSONSource).setData(labelPoints);
      }
      ensureZoneLabelLayers(map, labelPoints);
      applyZoneLabelLayerStyle(map);

      syncAllZoneVisualState(map);

      if (!zoneHoverHandlersBound.current && DESKTOP_ZONE_HOVER) {
        zoneHoverHandlersBound.current = true;

        const onZonePointerMove = (e: MapMouseEvent) => {
          const layers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
          if (layers.length === 0) return;
          const hit = map.queryRenderedFeatures(e.point, { layers: [...layers] })[0];
          const zoneKey = (hit?.properties?.zoneKey as string | undefined) ?? null;
          map.getCanvas().style.cursor = zoneKey ? "pointer" : "";
          setHoveredZoneKey(map, zoneKey);
        };

        const clearZoneHover = () => {
          map.getCanvas().style.cursor = "";
          setHoveredZoneKey(map, null);
        };

        map.on("mousemove", onZonePointerMove);
        map.on("mouseout", clearZoneHover);
      }

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
      }

      if (!mapBackgroundClickBound.current) {
        mapBackgroundClickBound.current = true;
        map.on("click", (e) => {
          const layers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
          if (layers.length === 0) return;
          const hits = map.queryRenderedFeatures(e.point, { layers: [...layers] });
          if (hits.length > 0) return;
          setHoveredZoneKey(map, null);
          onMapBackgroundClickRef.current();
        });
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    const zoneData = zonesAppliedRef.current;
    if (!map || !zoneData) return;

    const sync = () => syncAllZoneVisualState(map);

    if (map.isStyleLoaded()) sync();
    else map.once("load", sync);
  }, [activeZoneLabelKey, selectedZoneKey, zones]);

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
          paint: { "fill-color": "#6eb0ff", "fill-opacity": 0.16 },
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
    if (!map || !stadserfBoundary) return;
    const apply = () => {
      if (!map.getSource("stadserf-boundary")) {
        map.addSource("stadserf-boundary", {
          type: "geojson",
          data: stadserfBoundary,
        });
        map.addLayer({
          id: "stadserf-line",
          type: "line",
          source: "stadserf-boundary",
          paint: {
            "line-color": "#c084d4",
            "line-width": 2.5,
            "line-opacity": 0.72,
            "line-dasharray": [2, 1.2],
          },
        });
      } else {
        (map.getSource("stadserf-boundary") as GeoJSONSource).setData(stadserfBoundary);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [stadserfBoundary]);

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
    if (!pnrMarkerRef.current) {
      const el = createPnrMarkerElement();
      const open = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        onPnrSelectRef.current();
      };
      el.addEventListener("click", open);
      el.addEventListener("touchend", open, { passive: false });
      pnrMarkerRef.current = new Marker({ element: el, anchor: "center" })
        .setLngLat([PNR_ZUIDERVAL.lon, PNR_ZUIDERVAL.lat])
        .addTo(map);
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!destination) {
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
      return;
    }
    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new Marker({
        element: createDestinationMarkerElement(),
        anchor: "bottom",
      }).addTo(map);
    }
    destinationMarkerRef.current.setLngLat([destination.lon, destination.lat]);
  }, [destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.easeTo({
      center: [flyTo.lon, flyTo.lat],
      zoom: 16,
      duration: 700,
      ...FLAT_CAMERA,
    });
  }, [flyTo]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 h-full w-full touch-pan-x touch-pan-y"
      aria-label="Kaart Enschede"
    />
  );
}
