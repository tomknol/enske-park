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
import { useEffect, useLayoutEffect, useRef } from "react";
import type { FeatureCollection } from "geojson";
import {
  buildZoneLabelPoints,
  parseZoneCollectionKey,
  zoneCollectionKey,
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
  type ZoneSourceId,
  type ZoneStateTarget,
} from "@/lib/zone-map-highlight";
import type { GarageMarkerData } from "@/lib/garages";
import { resolveMapActivation } from "@/lib/map-activation";
import { mapPaintTransition, MOTION } from "@/lib/motion";
import {
  clearUserLocationData,
  ensureMapOverlayLayers,
  GARAGES_FILL_LAYER,
  GARAGES_HIT_LAYER,
  GARAGES_SOURCE,
  OVERLAY_HIT_LAYERS,
  setDestinationOverlayData,
  setGarageOverlayData,
  setUserLocationData,
  whenStyleReady,
} from "@/lib/map-overlays";
import type { HoveredMapFeature } from "@/lib/panel-context";
import {
  STADSERF_ACCESS_FILL_LAYER,
  STADSERF_ACCESS_HIT_LAYER,
  STADSERF_ACCESS_SOURCE,
  stadserfAccessPoints,
} from "@/lib/stadserf-access";
import {
  STADSERF_FILL_COLOR,
  STADSERF_FILL_OPACITY,
  STADSERF_LINE_COLOR,
  STADSERF_LINE_OPACITY,
  STADSERF_LINE_WIDTH,
} from "@/lib/stadserf-paint";
import {
  STADSERF_FEATURE_ID,
  STADSERF_FILL_LAYER,
  STADSERF_LINE_LAYER,
  STADSERF_SOURCE,
} from "@/lib/stadserf";
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
  onStadserfSelect: () => void;
  onStadserfAccessSelect: (id: string) => void;
  garages: GarageMarkerData[];
  stadserfBoundary: FeatureCollection | null;
  destination: { lon: number; lat: number } | null;
  flyTo: { lon: number; lat: number; token: number } | null;
  onMapBackgroundClick: (payload: { lon: number; lat: number }) => void;
  recenterToken: number;
  activeZoneLabelKey: string | null;
  selectedZoneKey: string | null;
  hoverClearToken?: number;
  stadserfSelected?: boolean;
  stadserfCurrent?: boolean;
  selectedAccessId?: string | null;
  selectedGarageId?: string | null;
  /** While an object is selected, hover does not change the panel or the map emphasis. */
  selectionActive?: boolean;
  onZoneHoverChange?: (hover: HoveredMapFeature | null) => void;
};

const ZONE_CLICK_LAYERS = ["paid-zones-fill", "permit-zones-fill"] as const;
/** Hold a zone hover across a one-frame gap between adjacent polygons. */
const ZONE_HOVER_LEAVE_MS = 40;

function applyStadserfPaint(map: MaplibreMap) {
  const motion = mapPaintTransition(MOTION.normal);
  if (map.getLayer(STADSERF_FILL_LAYER)) {
    map.setPaintProperty(STADSERF_FILL_LAYER, "fill-color", STADSERF_FILL_COLOR);
    map.setPaintProperty(STADSERF_FILL_LAYER, "fill-opacity", STADSERF_FILL_OPACITY);
    map.setPaintProperty(STADSERF_FILL_LAYER, "fill-opacity-transition", motion);
  }
  if (!map.getLayer(STADSERF_LINE_LAYER)) return;
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-color", STADSERF_LINE_COLOR);
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-opacity", STADSERF_LINE_OPACITY);
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-width", STADSERF_LINE_WIDTH);
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-color-transition", motion);
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-opacity-transition", motion);
  map.setPaintProperty(STADSERF_LINE_LAYER, "line-width-transition", motion);
}

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
  0.86,
  ["==", ["get", "centre"], true],
  0.54,
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
  ["==", ["get", "centre"], true],
  1.6,
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
  map.setPaintProperty(id, "text-opacity-transition", mapPaintTransition());
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

const ZONE_LINE_COLOR: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  ["get", "lineActive"],
  ["get", "line"],
];

function ensureZoneHighlightLayers(map: MaplibreMap, sourceId: ZoneSourceId) {
  const lineId = `${sourceId}-line`;
  const currentEdgeId = `${sourceId}-current-edge`;
  const selectedEdgeId = `${sourceId}-selected-edge`;
  const motion = mapPaintTransition();

  removeLegacyHighlightLayers(map, sourceId);
  if (map.getLayer(selectedEdgeId)) map.removeLayer(selectedEdgeId);
  if (map.getLayer(currentEdgeId)) map.removeLayer(currentEdgeId);
  if (!map.getSource(sourceId)) return;

  map.addLayer(
    {
      id: currentEdgeId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["get", "line"],
        "line-width": sourceId === "permit-zones" ? 3.2 : 3.6,
        "line-opacity": [
          "case",
          [
            "all",
            ["boolean", ["feature-state", "current"], false],
            ["!", ["boolean", ["feature-state", "selected"], false]],
          ],
          sourceId === "permit-zones" ? 0.08 : 0.1,
          0,
        ],
        "line-blur": 0.6,
        "line-width-transition": motion,
        "line-opacity-transition": motion,
      },
    },
    lineId,
  );
}

function applyZoneLayerPaint(map: MaplibreMap, sourceId: ZoneSourceId) {
  const fillId = `${sourceId}-fill`;
  const lineId = `${sourceId}-line`;
  const isPermit = sourceId === "permit-zones";
  const motion = mapPaintTransition();
  if (map.getLayer(fillId)) {
    map.setPaintProperty(
      fillId,
      "fill-opacity",
      isPermit ? PERMIT_FILL_OPACITY : ZONE_FILL_OPACITY,
    );
    map.setPaintProperty(fillId, "fill-opacity-transition", motion);
  }
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", ZONE_LINE_COLOR);
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
    map.setPaintProperty(lineId, "line-color-transition", motion);
    map.setPaintProperty(lineId, "line-width-transition", motion);
    map.setPaintProperty(lineId, "line-opacity-transition", motion);
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
  onStadserfSelect,
  onStadserfAccessSelect,
  garages,
  stadserfBoundary,
  destination,
  flyTo,
  onMapBackgroundClick,
  recenterToken,
  activeZoneLabelKey,
  selectedZoneKey,
  hoverClearToken = 0,
  stadserfSelected = false,
  stadserfCurrent = false,
  selectedAccessId = null,
  selectedGarageId = null,
  selectionActive = false,
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
  const onStadserfSelectRef = useRef(onStadserfSelect);
  const onStadserfAccessSelectRef = useRef(onStadserfAccessSelect);
  const onMapBackgroundClickRef = useRef(onMapBackgroundClick);
  const stadserfSelectedRef = useRef(stadserfSelected);
  const stadserfCurrentRef = useRef(stadserfCurrent);
  const stadserfHoverRef = useRef(false);
  const hoveredAccessIdRef = useRef<string | null>(null);
  const hoveredOverlayRef = useRef<{ source: string; id: string } | null>(null);
  const garageByIdRef = useRef<Map<string, GarageMarkerData>>(new Map());
  const onZoneHoverChangeRef = useRef(onZoneHoverChange);
  const activeZoneLabelKeyRef = useRef(activeZoneLabelKey);
  const selectedZoneKeyRef = useRef(selectedZoneKey);
  const zoneStateTargetsRef = useRef<ZoneStateTarget[]>([]);
  const hoveredZoneKeyRef = useRef<string | null>(null);
  const zoneLeaveTimerRef = useRef(0);
  const selectionActiveRef = useRef(selectionActive);
  const outsideHoverRef = useRef(false);
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
    onStadserfSelectRef.current = onStadserfSelect;
    onStadserfAccessSelectRef.current = onStadserfAccessSelect;
    onMapBackgroundClickRef.current = onMapBackgroundClick;
    onZoneHoverChangeRef.current = onZoneHoverChange;
    selectionActiveRef.current = selectionActive;
    activeZoneLabelKeyRef.current = activeZoneLabelKey;
    selectedZoneKeyRef.current = selectedZoneKey;
    stadserfSelectedRef.current = stadserfSelected;
    stadserfCurrentRef.current = stadserfCurrent;
  }, [
    onUserMovedMap,
    onZoneSelect,
    onGarageSelect,
    onStadserfSelect,
    onStadserfAccessSelect,
    onMapBackgroundClick,
    onZoneHoverChange,
    selectionActive,
    activeZoneLabelKey,
    selectedZoneKey,
    stadserfSelected,
    stadserfCurrent,
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

  const notifyFeatureHover = (hover: HoveredMapFeature | null) => {
    onZoneHoverChangeRef.current?.(hover);
  };

  const notifyZoneHover = (zoneKey: string | null) => {
    if (!zoneKey) {
      notifyFeatureHover(null);
      return;
    }
    const parsed = parseZoneCollectionKey(zoneKey);
    if (!parsed) {
      notifyFeatureHover(null);
      return;
    }
    notifyFeatureHover({ kind: parsed.kind, zoneRaw: parsed.zoneRaw });
  };

  const setHoveredZoneKey = (
    map: MaplibreMap,
    zoneKey: string | null,
    notify = true,
  ) => {
    if (hoveredZoneKeyRef.current === zoneKey) return;
    hoveredZoneKeyRef.current = zoneKey;
    syncAllZoneVisualState(map);
    if (notify) notifyZoneHover(zoneKey);
  };

  const setStadserfFeatureState = (
    map: MaplibreMap,
    state: { hover?: boolean; selected?: boolean; current?: boolean },
  ) => {
    if (!map.getSource(STADSERF_SOURCE)) return;
    map.setFeatureState({ source: STADSERF_SOURCE, id: STADSERF_FEATURE_ID }, state);
  };

  const syncStadserfHover = (map: MaplibreMap) => {
    setStadserfFeatureState(map, {
      hover: stadserfHoverRef.current || hoveredAccessIdRef.current != null,
    });
  };

  const setAccessFeatureState = (
    map: MaplibreMap,
    id: string | null,
    state: "hover" | "selected",
    value: boolean,
  ) => {
    if (!id || !map.getSource(STADSERF_ACCESS_SOURCE)) return;
    map.setFeatureState({ source: STADSERF_ACCESS_SOURCE, id }, { [state]: value });
  };

  const setOverlayHover = (map: MaplibreMap, source: string | null, id: string | null) => {
    const previous = hoveredOverlayRef.current;
    if (previous && (previous.source !== source || previous.id !== id)) {
      if (map.getSource(previous.source)) {
        map.setFeatureState(
          { source: previous.source, id: previous.id },
          { hover: false },
        );
      }
    }
    if (!source || !id || !map.getSource(source)) {
      hoveredOverlayRef.current = null;
      return;
    }
    if (previous?.source === source && previous.id === id) return;
    map.setFeatureState({ source, id }, { hover: true });
    hoveredOverlayRef.current = { source, id };
  };

  const setAccessHover = (map: MaplibreMap, id: string | null) => {
    if (hoveredAccessIdRef.current === id) return;
    setAccessFeatureState(map, hoveredAccessIdRef.current, "hover", false);
    hoveredAccessIdRef.current = id;
    setAccessFeatureState(map, id, "hover", true);
    syncStadserfHover(map);
  };

  const setStadserfHover = (map: MaplibreMap, hovered: boolean) => {
    if (stadserfHoverRef.current === hovered) return;
    stadserfHoverRef.current = hovered;
    syncStadserfHover(map);
  };

  const activateMapPoint = (
    map: MaplibreMap,
    point: { x: number; y: number },
    lngLat: { lng: number; lat: number },
  ) => {
    const overlayLayers = OVERLAY_HIT_LAYERS.filter((id) => map.getLayer(id));
    const screenPoint: [number, number] = [point.x, point.y];
    let overlay:
      | { kind: "garage"; id?: string }
      | { kind: "stadserf-access"; id: string }
      | null = null;
    if (overlayLayers.length > 0) {
      const overlayHit = map.queryRenderedFeatures(screenPoint, {
        layers: [...overlayLayers],
      })[0];
      const kind = overlayHit?.properties?.kind as string | undefined;
      if (kind === "garage") {
        overlay = {
          kind: "garage",
          id: overlayHit?.properties?.id as string | undefined,
        };
      }
    }
    if (!overlay && map.getLayer(STADSERF_ACCESS_HIT_LAYER)) {
      const accessHit = map.queryRenderedFeatures(screenPoint, {
        layers: [STADSERF_ACCESS_HIT_LAYER],
      })[0];
      const accessId = accessHit?.properties?.id as string | undefined;
      if (accessId) overlay = { kind: "stadserf-access", id: accessId };
    }

    const stadserfHit =
      map.getLayer(STADSERF_FILL_LAYER) != null &&
      map.queryRenderedFeatures(screenPoint, {
        layers: [STADSERF_FILL_LAYER],
      }).length > 0;

    let zone: {
      layerId: string;
      zoneRaw: string | null;
      gebiedCod: string | null;
    } | null = null;
    const zoneLayers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
    if (zoneLayers.length > 0) {
      const zoneHit = map.queryRenderedFeatures(screenPoint, {
        layers: [...zoneLayers],
      })[0];
      if (zoneHit) {
        zone = {
          layerId: zoneHit.layer?.id ?? "",
          zoneRaw: (zoneHit.properties?.ZONE as string) ?? null,
          gebiedCod: (zoneHit.properties?.GEBIED_COD as string) ?? null,
        };
      }
    }

    const activation = resolveMapActivation(overlay, stadserfHit, zone);
    if (activation.type === "garage") {
      const garage = activation.id
        ? garageByIdRef.current.get(activation.id)
        : undefined;
      if (garage) onGarageSelectRef.current(garage);
      return;
    }
    if (activation.type === "stadserf-access") {
      setHoveredZoneKey(map, null);
      setAccessHover(map, null);
      setStadserfHover(map, false);
      onStadserfAccessSelectRef.current(activation.id);
      return;
    }
    if (activation.type === "stadserf") {
      setHoveredZoneKey(map, null);
      setStadserfHover(map, false);
      onStadserfSelectRef.current();
      return;
    }
    if (activation.type === "zone") {
      const kind = activation.layerId.startsWith("permit") ? "permit" : "paid";
      const key = zoneCollectionKey(kind, activation.zoneRaw);
      if (selectedZoneKeyRef.current === key) {
        window.clearTimeout(zoneLeaveTimerRef.current);
        zoneLeaveTimerRef.current = 0;
        setHoveredZoneKey(map, null);
      }
      onZoneSelectRef.current({
        kind,
        zoneRaw: activation.zoneRaw,
        gebiedCod: activation.gebiedCod,
        lon: lngLat.lng,
        lat: lngLat.lat,
      });
      return;
    }

    setHoveredZoneKey(map, null);
    setStadserfHover(map, false);
    onMapBackgroundClickRef.current({
      lon: lngLat.lng,
      lat: lngLat.lat,
    });
  };

  useEffect(() => {
    activateMapPointRef.current = activateMapPoint;
  });

  useLayoutEffect(() => {
    if (hoverClearToken === 0) return;
    const map = mapRef.current;
    if (!map) return;
    window.clearTimeout(zoneLeaveTimerRef.current);
    zoneLeaveTimerRef.current = 0;
    setHoveredZoneKey(map, null);
    setAccessHover(map, null);
    setOverlayHover(map, null, null);
    setStadserfHover(map, false);
    const canvas = map.getCanvas?.();
    if (canvas) canvas.style.cursor = "";
    // These helpers are recreated every render and only read refs. Re-running
    // when they change would clear a hover on every paint after a dismiss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverClearToken]);

  useLayoutEffect(() => {
    selectionActiveRef.current = selectionActive;
    if (!selectionActive) return;
    const map = mapRef.current;
    if (!map) return;
    window.clearTimeout(zoneLeaveTimerRef.current);
    zoneLeaveTimerRef.current = 0;
    outsideHoverRef.current = false;
    setHoveredZoneKey(map, null, false);
    setAccessHover(map, null);
    setOverlayHover(map, null, null);
    setStadserfHover(map, false);
    notifyFeatureHover(null);
    // Helpers only read refs. Depending on them would re-clear hover every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionActive]);

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
      map.resize();
    };
    const stopStyleReady = whenStyleReady(map, onStyleReady);
    map.on("pitch", () => {
      if (map.getPitch() !== 0) map.setPitch(0);
    });

    map.on("dragstart", () => {
      onUserMovedMapRef.current();
      window.clearTimeout(zoneLeaveTimerRef.current);
      zoneLeaveTimerRef.current = 0;
      setHoveredZoneKey(map, null);
      setAccessHover(map, null);
      setOverlayHover(map, null, null);
      setStadserfHover(map, false);
      notifyFeatureHover(null);
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
      hoveredAccessIdRef.current = null;
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

        const cancelZoneLeave = () => {
          window.clearTimeout(zoneLeaveTimerRef.current);
          zoneLeaveTimerRef.current = 0;
        };
        const featureHoverActive = () =>
          hoveredZoneKeyRef.current != null ||
          hoveredAccessIdRef.current != null ||
          hoveredOverlayRef.current != null ||
          stadserfHoverRef.current;

        const clearFeatureHover = () => {
          setHoveredZoneKey(map, null, false);
          setAccessHover(map, null);
          setOverlayHover(map, null, null);
          setStadserfHover(map, false);
        };

        const showOutsideHover = () => {
          if (selectionActiveRef.current) return;
          if (outsideHoverRef.current && !featureHoverActive()) return;
          clearFeatureHover();
          outsideHoverRef.current = true;
          notifyFeatureHover({ kind: "outside" });
        };

        const scheduleOutsideHover = () => {
          if (zoneLeaveTimerRef.current) return;
          zoneLeaveTimerRef.current = window.setTimeout(() => {
            zoneLeaveTimerRef.current = 0;
            showOutsideHover();
          }, ZONE_HOVER_LEAVE_MS);
        };

        const queryTop = (point: MapMouseEvent["point"], ids: string[]) => {
          const layers = ids.filter((id) => map.getLayer(id));
          if (layers.length === 0) return undefined;
          return map.queryRenderedFeatures(point, { layers })[0];
        };

        const pointerIsInteractive = (point: MapMouseEvent["point"]) => {
          const garageHit = queryTop(point, [GARAGES_HIT_LAYER, GARAGES_FILL_LAYER]);
          if (garageHit?.properties?.kind === "garage" && garageHit.properties?.id) return true;
          const accessHit = queryTop(point, [
            STADSERF_ACCESS_HIT_LAYER,
            STADSERF_ACCESS_FILL_LAYER,
          ]);
          if (accessHit?.properties?.id) return true;
          if (
            map.getLayer(STADSERF_FILL_LAYER) != null &&
            map.queryRenderedFeatures(point, { layers: [STADSERF_FILL_LAYER] }).length > 0
          ) {
            return true;
          }
          const layers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
          return (
            layers.length > 0 &&
            map.queryRenderedFeatures(point, { layers: [...layers] }).length > 0
          );
        };

        const clearHoverEmphasis = () => {
          cancelZoneLeave();
          outsideHoverRef.current = false;
          clearFeatureHover();
          notifyFeatureHover(null);
        };

        const applyPointer = (point: MapMouseEvent["point"]) => {
          if (selectionActiveRef.current) {
            map.getCanvas().style.cursor = pointerIsInteractive(point) ? "pointer" : "";
            if (featureHoverActive() || outsideHoverRef.current) clearHoverEmphasis();
            return;
          }
          const garageHit = queryTop(point, [GARAGES_HIT_LAYER, GARAGES_FILL_LAYER]);
          const garageId = garageHit?.properties?.id as string | undefined;
          if (garageHit?.properties?.kind === "garage" && garageId) {
            const garage = garageByIdRef.current.get(garageId);
            map.getCanvas().style.cursor = "pointer";
            outsideHoverRef.current = false;
            cancelZoneLeave();
            setHoveredZoneKey(map, null, false);
            setAccessHover(map, null);
            setStadserfHover(map, false);
            setOverlayHover(map, GARAGES_SOURCE, garageId);
            notifyFeatureHover(garage ? { kind: "garage", garage } : null);
            return;
          }
          const accessHit = queryTop(point, [
            STADSERF_ACCESS_HIT_LAYER,
            STADSERF_ACCESS_FILL_LAYER,
          ]);
          const accessId = (accessHit?.properties?.id as string | undefined) ?? null;
          if (accessId) {
            map.getCanvas().style.cursor = "pointer";
            outsideHoverRef.current = false;
            cancelZoneLeave();
            setHoveredZoneKey(map, null, false);
            setOverlayHover(map, null, null);
            setStadserfHover(map, false);
            setAccessHover(map, accessId);
            notifyFeatureHover({ kind: "stadserf-access", id: accessId });
            return;
          }
          setAccessHover(map, null);
          setOverlayHover(map, null, null);
          const stadserfHit =
            map.getLayer(STADSERF_FILL_LAYER) != null &&
            map.queryRenderedFeatures(point, {
              layers: [STADSERF_FILL_LAYER],
            }).length > 0;
          if (stadserfHit) {
            map.getCanvas().style.cursor = "pointer";
            outsideHoverRef.current = false;
            cancelZoneLeave();
            setHoveredZoneKey(map, null, false);
            setStadserfHover(map, true);
            notifyFeatureHover({ kind: "stadserf" });
            return;
          }
          setStadserfHover(map, false);
          const layers = ZONE_CLICK_LAYERS.filter((id) => map.getLayer(id));
          const hit =
            layers.length > 0
              ? map.queryRenderedFeatures(point, { layers: [...layers] })[0]
              : undefined;
          const zoneKey = (hit?.properties?.zoneKey as string | undefined) ?? null;
          if (zoneKey) {
            outsideHoverRef.current = false;
            cancelZoneLeave();
            map.getCanvas().style.cursor = "pointer";
            setHoveredZoneKey(map, zoneKey);
            return;
          }
          map.getCanvas().style.cursor = "pointer";
          if (featureHoverActive()) {
            scheduleOutsideHover();
            return;
          }
          cancelZoneLeave();
          showOutsideHover();
        };

        const clearZoneHover = () => {
          cancelZoneLeave();
          outsideHoverRef.current = false;
          map.getCanvas().style.cursor = "";
          setHoveredZoneKey(map, null);
          setAccessHover(map, null);
          setOverlayHover(map, null, null);
          setStadserfHover(map, false);
          notifyFeatureHover(null);
        };

        map.on("mousemove", (e) => applyPointer(e.point));
        map.on("mouseout", clearZoneHover);
      }
    };

    const stop = whenStyleReady(map, apply);
    return () => {
      window.clearTimeout(zoneLeaveTimerRef.current);
      zoneLeaveTimerRef.current = 0;
      stop();
    };
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
      const existing = map.getSource(STADSERF_SOURCE) as
        | (GeoJSONSource & { promoteId?: unknown })
        | undefined;
      if (existing && existing.promoteId !== "id") {
        if (map.getLayer(STADSERF_LINE_LAYER)) map.removeLayer(STADSERF_LINE_LAYER);
        if (map.getLayer(STADSERF_FILL_LAYER)) map.removeLayer(STADSERF_FILL_LAYER);
        map.removeSource(STADSERF_SOURCE);
      }
      if (!map.getSource(STADSERF_SOURCE)) {
        map.addSource(STADSERF_SOURCE, {
          type: "geojson",
          data: stadserfBoundary,
          promoteId: "id",
        });
      } else {
        (map.getSource(STADSERF_SOURCE) as GeoJSONSource).setData(stadserfBoundary);
      }

      if (!map.getLayer(STADSERF_FILL_LAYER)) {
        map.addLayer({
          id: STADSERF_FILL_LAYER,
          type: "fill",
          source: STADSERF_SOURCE,
          paint: {
            "fill-color": STADSERF_FILL_COLOR,
            "fill-opacity": STADSERF_FILL_OPACITY,
          },
        });
      }

      if (!map.getLayer(STADSERF_LINE_LAYER)) {
        map.addLayer({
          id: STADSERF_LINE_LAYER,
          type: "line",
          source: STADSERF_SOURCE,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": STADSERF_LINE_COLOR,
            "line-width": STADSERF_LINE_WIDTH,
            "line-opacity": STADSERF_LINE_OPACITY,
            "line-dasharray": [2.4, 1.8],
          },
        });
      } else if (map.getLayer(STADSERF_FILL_LAYER)) {
        map.moveLayer(STADSERF_FILL_LAYER, STADSERF_LINE_LAYER);
      }

      applyStadserfPaint(map);
      setStadserfFeatureState(map, {
        selected: stadserfSelectedRef.current,
        current: stadserfCurrentRef.current,
        hover: stadserfHoverRef.current || hoveredAccessIdRef.current != null,
      });
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
    return whenStyleReady(map, () => {
      setStadserfFeatureState(map, {
        selected: stadserfSelected,
        current: stadserfCurrent,
      });
      if (map.getSource(STADSERF_ACCESS_SOURCE)) {
        for (const access of stadserfAccessPoints()) {
          map.setFeatureState(
            { source: STADSERF_ACCESS_SOURCE, id: access.id },
            { selected: access.id === selectedAccessId },
          );
        }
      }
      if (map.getSource(GARAGES_SOURCE)) {
        for (const id of garageByIdRef.current.keys()) {
          map.setFeatureState(
            { source: GARAGES_SOURCE, id },
            { selected: id === selectedGarageId },
          );
        }
      }
    });
  }, [stadserfSelected, stadserfCurrent, selectedAccessId, selectedGarageId]);

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
