import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import {
  GeoJSONSource,
  type ExpressionSpecification,
  type FilterSpecification,
  type Map as MaplibreMap,
} from "maplibre-gl";
import {
  formatGarageMarkerLabel,
  type GarageMarkerData,
  type GarageOccupancyLevel,
} from "@/lib/garages";
import {
  buildStadserfAccessCollection,
  createStadserfAccessIconImageData,
  STADSERF_ACCESS_FILL_LAYER,
  STADSERF_ACCESS_HIT_LAYER,
  STADSERF_ACCESS_ICON,
  STADSERF_ACCESS_ICON_LAYER,
  STADSERF_ACCESS_LABEL_LAYER,
  STADSERF_ACCESS_LABEL_MIN_ZOOM,
  STADSERF_ACCESS_SOURCE,
  type StadserfAccessDirection,
} from "@/lib/stadserf-access";
import { mapPaintTransition, motionMs, MOTION, prefersReducedMotion } from "@/lib/motion";
import { ZONE_LABEL_FONT } from "@/lib/zone-labels";

export const GARAGE_COUNT_MIN_ZOOM = 14.5;

function markerEmphasisScale(hover = 1.05): ExpressionSpecification {
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    1.05,
    ["boolean", ["feature-state", "hover"], false],
    hover,
    1,
  ];
}

function markerEmphasisActive(): ExpressionSpecification {
  return [
    "any",
    ["boolean", ["feature-state", "hover"], false],
    ["boolean", ["feature-state", "selected"], false],
  ];
}

export const USER_LOCATION_SOURCE = "user-location";
export const GARAGES_SOURCE = "garages";
export const DESTINATION_SOURCE = "destination";

export const USER_ACCURACY_LAYER = "user-accuracy-fill";
export const USER_DOT_LAYER = "user-location-dot";
export const GARAGES_HIT_LAYER = "garages-hit";
export const GARAGES_FILL_LAYER = "garages-fill";
export const GARAGES_LABEL_LAYER = "garages-label";
export const GARAGES_LABEL_DETAIL_LAYER = "garages-label-detail";
export const DESTINATION_LAYER = "destination-dot";

export const OVERLAY_HIT_LAYERS = [GARAGES_HIT_LAYER] as const;

const OVERLAY_LAYER_ORDER = [
  USER_ACCURACY_LAYER,
  GARAGES_HIT_LAYER,
  GARAGES_FILL_LAYER,
  GARAGES_LABEL_LAYER,
  GARAGES_LABEL_DETAIL_LAYER,
  STADSERF_ACCESS_HIT_LAYER,
  STADSERF_ACCESS_FILL_LAYER,
  STADSERF_ACCESS_ICON_LAYER,
  STADSERF_ACCESS_LABEL_LAYER,
  DESTINATION_LAYER,
  USER_DOT_LAYER,
] as const;

const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function garageDetailText(g: GarageMarkerData): string {
  if (g.live && g.level === "full") return "P VOL";
  if (g.live && g.vacant != null && g.level !== "full") return `P ${g.vacant}`;
  return "P";
}

export function garageOverlayText(g: GarageMarkerData, zoom: number): string {
  if (zoom < GARAGE_COUNT_MIN_ZOOM) return "P";
  return garageDetailText(g);
}

export function buildGarageCollection(
  garages: GarageMarkerData[],
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: garages.flatMap((g) => {
      if (g.lat == null || g.lon == null) return [];
      const feature: Feature<Point> = {
        type: "Feature",
        id: g.id,
        geometry: { type: "Point", coordinates: [g.lon, g.lat] },
        properties: {
          kind: "garage",
          id: g.id,
          textCompact: "P",
          textDetail: garageDetailText(g),
          ariaLabel: `${g.label}, ${g.live ? formatGarageMarkerLabel(g.level as GarageOccupancyLevel, g.vacant) : "Bezetting onbekend"}`,
        },
      };
      return [feature];
    }),
  };
}

export function buildDestinationCollection(
  destination: { lon: number; lat: number } | null,
): FeatureCollection<Point> {
  if (!destination) return EMPTY_COLLECTION as FeatureCollection<Point>;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [destination.lon, destination.lat],
        },
        properties: { kind: "destination", fade: 1, scale: 1 },
      },
    ],
  };
}

export function buildAccuracyRing(
  lon: number,
  lat: number,
  accuracyMeters: number,
): Feature<Polygon> {
  const radiusM = Math.min(Math.max(accuracyMeters, 8), 80);
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(latRad);
  const dLat = radiusM / metersPerDegLat;
  const dLon = radiusM / metersPerDegLon;
  const ring = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
  });
  ring.push(ring[0]);
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {},
  };
}

export function buildUserLocationCollection(
  lon: number,
  lat: number,
  accuracyMeters: number,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { kind: "user" },
      },
      buildAccuracyRing(lon, lat, accuracyMeters),
    ],
  };
}

function emptySource(map: MaplibreMap, id: string, promoteId?: string) {
  if (map.getSource(id)) return;
  map.addSource(id, {
    type: "geojson",
    data: EMPTY_COLLECTION,
    ...(promoteId ? { promoteId } : {}),
  });
}

/** MapLibre `load` / `isStyleLoaded()` can stay false when a style image is missing. */
export function whenStyleReady(map: MaplibreMap, fn: () => void): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) return true;
    if (!map.getStyle()?.layers?.length) return false;
    fn();
    return true;
  };
  if (run()) return () => {
    cancelled = true;
  };
  const onReady = () => {
    if (!run()) return;
    map.off("load", onReady);
    map.off("styledata", onReady);
  };
  map.on("load", onReady);
  map.on("styledata", onReady);
  return () => {
    cancelled = true;
    map.off("load", onReady);
    map.off("styledata", onReady);
  };
}

function setSourceData(map: MaplibreMap, id: string, data: FeatureCollection) {
  const source = map.getSource(id);
  if (source) {
    (source as GeoJSONSource).setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

function ensureStadserfAccessImages(map: MaplibreMap) {
  if (typeof document === "undefined") return;
  for (const direction of Object.keys(STADSERF_ACCESS_ICON) as StadserfAccessDirection[]) {
    const id = STADSERF_ACCESS_ICON[direction];
    if (map.hasImage(id)) continue;
    const image = createStadserfAccessIconImageData(direction);
    map.addImage(id, image, { pixelRatio: 2 });
  }
}

const ACCESS_MARKER_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  ["*", markerEmphasisScale(), 8],
  14,
  ["*", markerEmphasisScale(), 11],
  17,
  ["*", markerEmphasisScale(), 13],
];

const ACCESS_ICON_SIZE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.58,
  14,
  0.76,
  17,
  0.88,
];

const ACCESS_ICON_OPACITY: ExpressionSpecification = [
  "case",
  markerEmphasisActive(),
  1,
  0.9,
];

const ACCESS_LABEL_OPACITY: ExpressionSpecification = [
  "case",
  markerEmphasisActive(),
  0.95,
  0.72,
];

function ensureStadserfAccessLayers(map: MaplibreMap) {
  ensureStadserfAccessImages(map);
  if (!map.getSource(STADSERF_ACCESS_SOURCE)) {
    map.addSource(STADSERF_ACCESS_SOURCE, {
      type: "geojson",
      data: buildStadserfAccessCollection(),
      promoteId: "id",
    });
  } else {
    setSourceData(map, STADSERF_ACCESS_SOURCE, buildStadserfAccessCollection());
  }

  if (!map.getLayer(STADSERF_ACCESS_HIT_LAYER)) {
    map.addLayer({
      id: STADSERF_ACCESS_HIT_LAYER,
      type: "circle",
      source: STADSERF_ACCESS_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          12,
          17,
          16,
        ],
        "circle-color": "#000000",
        "circle-opacity": 0,
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }
  map.setLayerZoomRange(STADSERF_ACCESS_HIT_LAYER, 0, 24);

  if (!map.getLayer(STADSERF_ACCESS_FILL_LAYER)) {
    map.addLayer({
      id: STADSERF_ACCESS_FILL_LAYER,
      type: "circle",
      source: STADSERF_ACCESS_SOURCE,
      paint: {
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }
  map.setLayerZoomRange(STADSERF_ACCESS_FILL_LAYER, 0, 24);
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-radius", ACCESS_MARKER_RADIUS);
  map.setPaintProperty(
    STADSERF_ACCESS_FILL_LAYER,
    "circle-radius-transition",
    mapPaintTransition(MOTION.fast),
  );
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-color", [
    "case",
    markerEmphasisActive(),
    "rgba(24, 16, 26, 0.96)",
    "rgba(10, 13, 19, 0.92)",
  ]);
  map.setPaintProperty(
    STADSERF_ACCESS_FILL_LAYER,
    "circle-color-transition",
    mapPaintTransition(MOTION.fast),
  );
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-stroke-width", [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    1.75,
    ["boolean", ["feature-state", "hover"], false],
    1.45,
    1.15,
  ]);
  map.setPaintProperty(
    STADSERF_ACCESS_FILL_LAYER,
    "circle-stroke-width-transition",
    mapPaintTransition(MOTION.fast),
  );
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-stroke-color", [
    "case",
    ["boolean", ["feature-state", "selected"], false],
    "#f3e8ff",
    ["boolean", ["feature-state", "hover"], false],
    "#e9d5ff",
    "#c084d4",
  ]);
  map.setPaintProperty(
    STADSERF_ACCESS_FILL_LAYER,
    "circle-stroke-color-transition",
    mapPaintTransition(MOTION.fast),
  );
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-opacity", 1);
  map.setPaintProperty(STADSERF_ACCESS_FILL_LAYER, "circle-stroke-opacity", 1);

  if (!map.getLayer(STADSERF_ACCESS_ICON_LAYER)) {
    map.addLayer({
      id: STADSERF_ACCESS_ICON_LAYER,
      type: "symbol",
      source: STADSERF_ACCESS_SOURCE,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-padding": 0,
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
      },
    });
  }
  map.setLayerZoomRange(STADSERF_ACCESS_ICON_LAYER, 0, 24);
  map.setLayoutProperty(STADSERF_ACCESS_ICON_LAYER, "icon-size", ACCESS_ICON_SIZE);
  map.setPaintProperty(STADSERF_ACCESS_ICON_LAYER, "icon-opacity", ACCESS_ICON_OPACITY);
  map.setPaintProperty(
    STADSERF_ACCESS_ICON_LAYER,
    "icon-opacity-transition",
    mapPaintTransition(MOTION.fast),
  );

  if (!map.getLayer(STADSERF_ACCESS_LABEL_LAYER)) {
    map.addLayer({
      id: STADSERF_ACCESS_LABEL_LAYER,
      type: "symbol",
      source: STADSERF_ACCESS_SOURCE,
      minzoom: STADSERF_ACCESS_LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "name"],
        "text-font": [...ZONE_LABEL_FONT],
        "text-size": 9,
        "text-anchor": "top",
        "text-offset": [0, 1.15],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-optional": true,
        "text-padding": 0,
      },
      paint: {
        "text-color": "#d4a3de",
        "text-halo-color": "rgba(10, 13, 19, 0.88)",
        "text-halo-width": 1.2,
      },
    });
  }
  map.setPaintProperty(STADSERF_ACCESS_LABEL_LAYER, "text-opacity", ACCESS_LABEL_OPACITY);
  map.setPaintProperty(
    STADSERF_ACCESS_LABEL_LAYER,
    "text-opacity-transition",
    mapPaintTransition(MOTION.fast),
  );
}

export function ensureMapOverlayLayers(map: MaplibreMap) {
  removeRetiredPnrOverlay(map);
  emptySource(map, USER_LOCATION_SOURCE);
  emptySource(map, GARAGES_SOURCE, "id");
  emptySource(map, DESTINATION_SOURCE);
  ensureStadserfAccessLayers(map);

  if (!map.getLayer(USER_ACCURACY_LAYER)) {
    map.addLayer({
      id: USER_ACCURACY_LAYER,
      type: "fill",
      source: USER_LOCATION_SOURCE,
      filter: ["==", ["geometry-type"], "Polygon"] as FilterSpecification,
      paint: { "fill-color": "#6eb0ff", "fill-opacity": 0.16 },
    });
  }

  if (!map.getLayer(GARAGES_HIT_LAYER)) {
    map.addLayer({
      id: GARAGES_HIT_LAYER,
      type: "circle",
      source: GARAGES_SOURCE,
      paint: {
        "circle-radius": 16,
        "circle-color": "#000000",
        "circle-opacity": 0,
      },
    });
  }

  if (!map.getLayer(GARAGES_FILL_LAYER)) {
    map.addLayer({
      id: GARAGES_FILL_LAYER,
      type: "circle",
      source: GARAGES_SOURCE,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          GARAGE_COUNT_MIN_ZOOM - 0.05,
          ["*", markerEmphasisScale(), 10],
          GARAGE_COUNT_MIN_ZOOM,
          ["*", markerEmphasisScale(), 14],
        ],
        "circle-radius-transition": mapPaintTransition(MOTION.fast),
        "circle-color": [
          "case",
          [
            "any",
            ["boolean", ["feature-state", "hover"], false],
            ["boolean", ["feature-state", "selected"], false],
          ],
          "rgba(18, 24, 34, 0.96)",
          "rgba(10, 13, 19, 0.9)",
        ],
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1.6,
          ["boolean", ["feature-state", "hover"], false],
          1.35,
          1,
        ],
        "circle-stroke-width-transition": mapPaintTransition(MOTION.fast),
        "circle-stroke-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "rgba(186, 214, 242, 0.72)",
          ["boolean", ["feature-state", "hover"], false],
          "rgba(160, 196, 230, 0.55)",
          "rgba(120, 155, 195, 0.32)",
        ],
        "circle-stroke-color-transition": mapPaintTransition(MOTION.fast),
        "circle-color-transition": mapPaintTransition(MOTION.fast),
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }

  const garageLabelLayout = {
    "text-font": [...ZONE_LABEL_FONT],
    "text-size": 10,
    "text-anchor": "center" as const,
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-optional": false,
    "text-padding": 0,
  };
  const garageLabelPaint = {
    "text-color": [
      "case",
      markerEmphasisActive(),
      "#e8f3fc",
      "#b4cce8",
    ] as ExpressionSpecification,
    "text-color-transition": mapPaintTransition(MOTION.fast),
    "text-halo-color": "rgba(10, 13, 19, 0.92)",
    "text-halo-width": 1.6,
    "text-opacity": [
      "case",
      markerEmphasisActive(),
      1,
      0.86,
    ] as ExpressionSpecification,
    "text-opacity-transition": mapPaintTransition(MOTION.fast),
  };

  if (!map.getLayer(GARAGES_LABEL_LAYER)) {
    map.addLayer({
      id: GARAGES_LABEL_LAYER,
      type: "symbol",
      source: GARAGES_SOURCE,
      maxzoom: GARAGE_COUNT_MIN_ZOOM,
      layout: {
        ...garageLabelLayout,
        "text-field": ["get", "textCompact"],
      },
      paint: garageLabelPaint,
    });
  }

  if (!map.getLayer(GARAGES_LABEL_DETAIL_LAYER)) {
    map.addLayer({
      id: GARAGES_LABEL_DETAIL_LAYER,
      type: "symbol",
      source: GARAGES_SOURCE,
      minzoom: GARAGE_COUNT_MIN_ZOOM,
      layout: {
        ...garageLabelLayout,
        "text-field": ["get", "textDetail"],
      },
      paint: garageLabelPaint,
    });
  }

  for (const id of [GARAGES_LABEL_LAYER, GARAGES_LABEL_DETAIL_LAYER]) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "text-color", garageLabelPaint["text-color"]);
    map.setPaintProperty(id, "text-color-transition", garageLabelPaint["text-color-transition"]);
    map.setPaintProperty(id, "text-opacity", garageLabelPaint["text-opacity"]);
    map.setPaintProperty(id, "text-opacity-transition", garageLabelPaint["text-opacity-transition"]);
  }

  if (!map.getLayer(DESTINATION_LAYER)) {
    map.addLayer({
      id: DESTINATION_LAYER,
      type: "circle",
      source: DESTINATION_SOURCE,
      paint: {
        "circle-radius": ["*", 7, ["coalesce", ["get", "scale"], 1]],
        "circle-radius-transition": mapPaintTransition(MOTION.fast),
        "circle-opacity": ["coalesce", ["get", "fade"], 1],
        "circle-opacity-transition": mapPaintTransition(MOTION.fast),
        "circle-color": "#fbbf24",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-opacity": ["coalesce", ["get", "fade"], 1],
        "circle-stroke-opacity-transition": mapPaintTransition(MOTION.fast),
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }

  if (!map.getLayer(USER_DOT_LAYER)) {
    map.addLayer({
      id: USER_DOT_LAYER,
      type: "circle",
      source: USER_LOCATION_SOURCE,
      filter: ["==", ["geometry-type"], "Point"] as FilterSpecification,
      paint: {
        "circle-radius": 5.5,
        "circle-color": "#6eb0ff",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }

  for (const id of OVERLAY_LAYER_ORDER) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

export function setUserLocationData(
  map: MaplibreMap,
  lon: number,
  lat: number,
  accuracyMeters: number,
) {
  ensureMapOverlayLayers(map);
  setSourceData(
    map,
    USER_LOCATION_SOURCE,
    buildUserLocationCollection(lon, lat, accuracyMeters),
  );
}

export function clearUserLocationData(map: MaplibreMap) {
  ensureMapOverlayLayers(map);
  setSourceData(map, USER_LOCATION_SOURCE, EMPTY_COLLECTION);
}

export function setGarageOverlayData(map: MaplibreMap, garages: GarageMarkerData[]) {
  ensureMapOverlayLayers(map);
  setSourceData(map, GARAGES_SOURCE, buildGarageCollection(garages));
}

const RETIRED_PNR_LAYERS = ["pnr-label", "pnr-fill", "pnr-hit"] as const;

function removeRetiredPnrOverlay(map: MaplibreMap) {
  for (const id of RETIRED_PNR_LAYERS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource("pnr")) map.removeSource("pnr");
}

let destinationFadeTimer: number | null = null;
let shownDestination: { lon: number; lat: number } | null = null;

function destinationCollection(
  destination: { lon: number; lat: number } | null,
  fade: number,
  scale: number,
): FeatureCollection<Point> {
  if (!destination) return EMPTY_COLLECTION as FeatureCollection<Point>;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [destination.lon, destination.lat],
        },
        properties: { kind: "destination", fade, scale },
      },
    ],
  };
}

function clearDestinationFadeTimer() {
  if (destinationFadeTimer == null || typeof window === "undefined") return;
  window.clearTimeout(destinationFadeTimer);
  destinationFadeTimer = null;
}

export function setDestinationOverlayData(
  map: MaplibreMap,
  destination: { lon: number; lat: number } | null,
) {
  ensureMapOverlayLayers(map);
  clearDestinationFadeTimer();

  if (!destination) {
    const leaving = shownDestination;
    shownDestination = null;
    if (!leaving || prefersReducedMotion()) {
      setSourceData(map, DESTINATION_SOURCE, EMPTY_COLLECTION);
      return;
    }
    setSourceData(map, DESTINATION_SOURCE, destinationCollection(leaving, 0, 1));
    destinationFadeTimer = window.setTimeout(() => {
      destinationFadeTimer = null;
      if (shownDestination) return;
      setSourceData(map, DESTINATION_SOURCE, EMPTY_COLLECTION);
    }, motionMs(MOTION.fast));
    return;
  }

  const same =
    shownDestination != null &&
    shownDestination.lon === destination.lon &&
    shownDestination.lat === destination.lat;
  shownDestination = destination;
  if (same || prefersReducedMotion()) {
    setSourceData(map, DESTINATION_SOURCE, destinationCollection(destination, 1, 1));
    return;
  }

  setSourceData(map, DESTINATION_SOURCE, destinationCollection(destination, 0, 0.9));
  requestAnimationFrame(() => {
    if (
      !shownDestination ||
      shownDestination.lon !== destination.lon ||
      shownDestination.lat !== destination.lat
    ) {
      return;
    }
    setSourceData(map, DESTINATION_SOURCE, destinationCollection(destination, 1, 1));
  });
}
