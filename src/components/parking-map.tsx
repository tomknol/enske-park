"use client";

import {
  GeoJSONSource,
  Map as MaplibreMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type MapMouseEvent,
  type MapTouchEvent,
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
  clearUserLocationData,
  ensureMapOverlayLayers,
  OVERLAY_HIT_LAYERS,
  setDestinationOverlayData,
  setGarageOverlayData,
  setPnrOverlayData,
  setUserLocationData,
  whenStyleReady,
} from "@/lib/map-overlays";
import { MAP_STYLE_URL } from "@/lib/map-theme";
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
    lon?: number;
    lat?: number;
  }) => void;
  onGarageSelect: (garage: GarageMarkerData) => void;
  onPnrSelect: () => void;
  garages: GarageMarkerData[];
  stadserfBoundary: FeatureCollection | null;
  destination: { lon: number; lat: number } | null;
  flyTo: { lon: number; lat: number; token: number } | null;
  onMapBackgroundClick: (payload: { lon: number; lat: number }) => void;
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

function paidLabelSizeAtZoom(
  currentHover: number,
  current: number,
  hover: number,
  base: number,
): ExpressionSpecification {
  return [
    "case",
    [
      "all",
      ["boolean", ["get", "emphasized"], false],
      ["boolean", ["get", "labelHover"], false],
    ],
    currentHover,
    ["boolean", ["get", "emphasized"], false],
    current,
    ["boolean", ["get", "labelHover"], false],
    hover,
    ["boolean", ["get", "labelSelected"], false],
    hover,
    base,
  ];
}

const PAID_ZONE_LABEL_SIZE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0,
  12,
  paidLabelSizeAtZoom(38, 34, 31, 28),
  13.5,
  paidLabelSizeAtZoom(50, 46, 42, 38),
  15,
  paidLabelSizeAtZoom(64, 58, 53, 48),
  16.5,
  paidLabelSizeAtZoom(74, 68, 63, 58),
  18,
  paidLabelSizeAtZoom(84, 78, 72, 66),
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
  [
    "all",
    ["boolean", ["get", "emphasized"], false],
    ["boolean", ["get", "labelHover"], false],
  ],
  0.96,
  ["boolean", ["get", "emphasized"], false],
  0.9,
  ["boolean", ["get", "labelHover"], false],
  0.8,
  ["boolean", ["get", "labelSelected"], false],
  0.78,
  0.62,
];

const PAID_ZONE_LABEL_HALO_WIDTH: ExpressionSpecification = [
  "case",
  [
    "all",
    ["boolean", ["get", "emphasized"], false],
    ["boolean", ["get", "labelHover"], false],
  ],
  3.2,
  ["boolean", ["get", "emphasized"], false],
  2.8,
  ["boolean", ["get", "labelHover"], false],
  2.45,
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
    [
      "any",
      ["boolean", ["get", "emphasized"], false],
      ["boolean", ["get", "labelHover"], false],
    ],
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
  for (const id of [currentEdgeId, selectedEdgeId]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (!map.getSource(sourceId)) return;

  map.addLayer(
    {
      id: currentEdgeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["get", "line"],
        "line-width": sourceId === "permit-zones" ? 4 : 4.5,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "current"], false],
          sourceId === "permit-zones" ? 0.08 : 0.1,
          0,
        ],
        "line-blur": 1,
        "line-width-transition": ZONE_PAINT_TRANSITION,
        "line-opacity-transition": ZONE_PAINT_TRANSITION,
      },
    },
    lineId,
  );

  map.addLayer(
    {
      id: selectedEdgeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "rgba(198, 208, 222, 0.65)",
        "line-width": 1.5,
        "line-opacity": [
          "case",
          [
            "all",
            ["boolean", ["feature-state", "selected"], false],
            ["!", ["boolean", ["feature-state", "current"], false]],
          ],
          0.45,
          0,
        ],
        "line-dasharray": [2, 2.5],
      },
    },
    lineId,
  );
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
      const labelHover = hoveredZoneKey != null && zoneKey === hoveredZoneKey;
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
  const hasCenteredOnUser = useRef(false);
  const labelPointsRef = useRef<FeatureCollection | null>(null);
  const zonesAppliedRef = useRef<ZoneCollections | null>(null);
  const onUserMovedMapRef = useRef(onUserMovedMap);
  const onZoneSelectRef = useRef(onZoneSelect);
  const onGarageSelectRef = useRef(onGarageSelect);
  const onPnrSelectRef = useRef(onPnrSelect);
  const onMapBackgroundClickRef = useRef(onMapBackgroundClick);
  const garageByIdRef = useRef<Map<string, GarageMarkerData>>(new Map());
  const onZoneHoverChangeRef = useRef(onZoneHoverChange);
  const activeZoneLabelKeyRef = useRef(activeZoneLabelKey);
  const selectedZoneKeyRef = useRef(selectedZoneKey);
  const zoneStateTargetsRef = useRef<ZoneStateTarget[]>([]);
  const hoveredZoneKeyRef = useRef<string | null>(null);
  const labelBaseRef = useRef<FeatureCollection | null>(null);
  const zoneHoverHandlersBound = useRef(false);
  const activateMapPointRef = useRef<
    (
      map: MaplibreMap,
      point: { x: number; y: number },
      lngLat: { lng: number; lat: number },
    ) => void
  >(() => {});
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

  const activateMapPoint = (
    map: MaplibreMap,
    point: { x: number; y: number },
    lngLat: { lng: number; lat: number },
  ) => {
    const overlayLayers = OVERLAY_HIT_LAYERS.filter((id) => map.getLayer(id));
    const screenPoint: [number, number] = [point.x, point.y];
    if (overlayLayers.length > 0) {
      const overlayHit = map.queryRenderedFeatures(screenPoint, {
        layers: [...overlayLayers],
      })[0];
      if (overlayHit) {
        const kind = overlayHit.properties?.kind as string | undefined;
        if (kind === "garage") {
          const id = overlayHit.properties?.id as string | undefined;
          const garage = id ? garageByIdRef.current.get(id) : undefined;
          if (garage) onGarageSelectRef.current(garage);
          return;
        }
        if (kind === "pnr") {
          onPnrSelectRef.current();
          return;
        }
      }
    }

    const zoneLayers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
    if (zoneLayers.length > 0) {
      const zoneHit = map.queryRenderedFeatures(screenPoint, {
        layers: [...zoneLayers],
      })[0];
      if (zoneHit) {
        const layerId = zoneHit.layer?.id ?? "";
        onZoneSelectRef.current({
          kind: layerId.startsWith("permit") ? "permit" : "paid",
          zoneRaw: (zoneHit.properties?.ZONE as string) ?? null,
          gebiedCod: (zoneHit.properties?.GEBIED_COD as string) ?? null,
          lon: lngLat.lng,
          lat: lngLat.lat,
        });
        return;
      }
    }

    setHoveredZoneKey(map, null);
    onMapBackgroundClickRef.current({
      lon: lngLat.lng,
      lat: lngLat.lat,
    });
  };

  useEffect(() => {
    activateMapPointRef.current = activateMapPoint;
  });

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

    map.touchZoomRotate.disableRotation();

    let pendingTouch: {
      point: { x: number; y: number };
      lngLat: { lng: number; lat: number };
      at: number;
    } | null = null;

    const onTouchEnd = (e: MapTouchEvent) => {
      if (e.originalEvent.changedTouches.length !== 1) {
        pendingTouch = null;
        return;
      }
      pendingTouch = {
        point: e.point,
        lngLat: e.lngLat,
        at: performance.now(),
      };
    };

    const onMapClick = (e: MapMouseEvent) => {
      const touch = pendingTouch;
      pendingTouch = null;
      const fromTouch = touch != null && performance.now() - touch.at < 450;
      const point = fromTouch ? touch.point : e.point;
      const lngLat = fromTouch ? touch.lngLat : e.lngLat;
      activateMapPointRef.current(map, point, lngLat);
    };

    map.on("touchend", onTouchEnd);
    map.on("click", onMapClick);

    const onViewportResize = () => {
      map.resize();
    };
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(map.getContainer());
    window.visualViewport?.addEventListener("resize", onViewportResize);
    window.addEventListener("orientationchange", onViewportResize);

    const onStyleReady = () => {
      applyFlatMapStyle(map);
      applyParkingFocusBasemap(map);
      ensureMapOverlayLayers(map);
      setPnrOverlayData(map);
      map.resize();
    };
    const stopStyleReady = whenStyleReady(map, onStyleReady);
    map.on("pitch", () => {
      if (map.getPitch() !== 0) map.setPitch(0);
    });

    map.on("dragstart", () => {
      onUserMovedMapRef.current();
      setHoveredZoneKey(map, null);
    });

    mapRef.current = map;

    return () => {
      stopStyleReady();
      resizeObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.removeEventListener("orientationchange", onViewportResize);
      map.off("touchend", onTouchEnd);
      map.off("click", onMapClick);
      map.remove();
      mapRef.current = null;
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
      ensureMapOverlayLayers(map);

      syncAllZoneVisualState(map);

      if (!zoneHoverHandlersBound.current && DESKTOP_ZONE_HOVER) {
        zoneHoverHandlersBound.current = true;

        const onZonePointerMove = (e: MapMouseEvent) => {
          const overlayLayers = OVERLAY_HIT_LAYERS.filter((id) => map.getLayer(id));
          const overlayHit =
            overlayLayers.length > 0
              ? map.queryRenderedFeatures(e.point, {
                  layers: [...overlayLayers],
                })[0]
              : undefined;
          if (overlayHit) {
            map.getCanvas().style.cursor = "pointer";
            setHoveredZoneKey(map, null);
            return;
          }
          const layers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
          const hit =
            layers.length > 0
              ? map.queryRenderedFeatures(e.point, { layers: [...layers] })[0]
              : undefined;
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
    };

    return whenStyleReady(map, apply);
  }, [zones]);

  useEffect(() => {
    const map = mapRef.current;
    const zoneData = zonesAppliedRef.current;
    if (!map || !zoneData) return;

    const sync = () => syncAllZoneVisualState(map);

    return whenStyleReady(map, sync);
  }, [activeZoneLabelKey, selectedZoneKey, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!position) {
      return whenStyleReady(map, () => clearUserLocationData(map));
    }

    const { lon, lat, accuracy } = position;

    const stop = whenStyleReady(map, () =>
      setUserLocationData(map, lon, lat, accuracy),
    );

    if (!hasCenteredOnUser.current) {
      map.easeTo({ center: [lon, lat], zoom: 16, duration: 600, ...FLAT_CAMERA });
      hasCenteredOnUser.current = true;
    }
    return stop;
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
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#c084d4",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              1.5,
              14,
              2.25,
              16,
              2.75,
            ],
            "line-opacity": 0.58,
            "line-dasharray": [2.4, 1.8],
          },
        });
      } else {
        (map.getSource("stadserf-boundary") as GeoJSONSource).setData(stadserfBoundary);
      }
      ensureMapOverlayLayers(map);
    };
    return whenStyleReady(map, apply);
  }, [stadserfBoundary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    garageByIdRef.current.clear();
    for (const g of garages) garageByIdRef.current.set(g.id, g);

    return whenStyleReady(map, () => setGarageOverlayData(map, garages));
  }, [garages]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return whenStyleReady(map, () => setPnrOverlayData(map));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return whenStyleReady(map, () => setDestinationOverlayData(map, destination));
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
      className="absolute inset-0 z-0 h-full w-full"
      aria-label="Kaart Enschede"
    />
  );
}
