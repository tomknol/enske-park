import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { GeoJSONSource, type FilterSpecification, type Map as MaplibreMap } from "maplibre-gl";
import {
  formatGarageMarkerLabel,
  type GarageMarkerData,
  type GarageOccupancyLevel,
} from "@/lib/garages";
import { ZONE_LABEL_FONT } from "@/lib/zone-labels";
import { PNR_ZUIDERVAL } from "@/lib/pnr-zuiderval";

export const GARAGE_COUNT_MIN_ZOOM = 14.5;

export const USER_LOCATION_SOURCE = "user-location";
export const GARAGES_SOURCE = "garages";
export const PNR_SOURCE = "pnr";
export const DESTINATION_SOURCE = "destination";

export const USER_ACCURACY_LAYER = "user-accuracy-fill";
export const USER_DOT_LAYER = "user-location-dot";
export const GARAGES_HIT_LAYER = "garages-hit";
export const GARAGES_FILL_LAYER = "garages-fill";
export const GARAGES_LABEL_LAYER = "garages-label";
export const GARAGES_LABEL_DETAIL_LAYER = "garages-label-detail";
export const PNR_HIT_LAYER = "pnr-hit";
export const PNR_FILL_LAYER = "pnr-fill";
export const PNR_LABEL_LAYER = "pnr-label";
export const DESTINATION_LAYER = "destination-dot";

export const OVERLAY_HIT_LAYERS = [GARAGES_HIT_LAYER, PNR_HIT_LAYER] as const;

const OVERLAY_LAYER_ORDER = [
  USER_ACCURACY_LAYER,
  GARAGES_HIT_LAYER,
  GARAGES_FILL_LAYER,
  GARAGES_LABEL_LAYER,
  GARAGES_LABEL_DETAIL_LAYER,
  PNR_HIT_LAYER,
  PNR_FILL_LAYER,
  PNR_LABEL_LAYER,
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

export function buildPnrCollection(): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: PNR_ZUIDERVAL.id,
        geometry: {
          type: "Point",
          coordinates: [PNR_ZUIDERVAL.lon, PNR_ZUIDERVAL.lat],
        },
        properties: {
          kind: "pnr",
          id: PNR_ZUIDERVAL.id,
          label: "P+R",
          sublabel: "€3",
        },
      },
    ],
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
        properties: { kind: "destination" },
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

function emptySource(map: MaplibreMap, id: string) {
  if (map.getSource(id)) return;
  map.addSource(id, { type: "geojson", data: EMPTY_COLLECTION });
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

export function ensureMapOverlayLayers(map: MaplibreMap) {
  emptySource(map, USER_LOCATION_SOURCE);
  emptySource(map, GARAGES_SOURCE);
  emptySource(map, PNR_SOURCE);
  emptySource(map, DESTINATION_SOURCE);

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
          10,
          GARAGE_COUNT_MIN_ZOOM,
          14,
        ],
        "circle-color": "rgba(10, 13, 19, 0.9)",
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(120, 155, 195, 0.32)",
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
    "text-color": "#b4cce8",
    "text-halo-color": "rgba(10, 13, 19, 0.92)",
    "text-halo-width": 1.6,
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

  if (!map.getLayer(PNR_HIT_LAYER)) {
    map.addLayer({
      id: PNR_HIT_LAYER,
      type: "circle",
      source: PNR_SOURCE,
      paint: {
        "circle-radius": 18,
        "circle-color": "#000000",
        "circle-opacity": 0,
      },
    });
  }

  if (!map.getLayer(PNR_FILL_LAYER)) {
    map.addLayer({
      id: PNR_FILL_LAYER,
      type: "circle",
      source: PNR_SOURCE,
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(10, 13, 19, 0.88)",
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(167, 243, 199, 0.25)",
        "circle-pitch-alignment": "viewport",
        "circle-pitch-scale": "viewport",
      },
    });
  }

  if (!map.getLayer(PNR_LABEL_LAYER)) {
    map.addLayer({
      id: PNR_LABEL_LAYER,
      type: "symbol",
      source: PNR_SOURCE,
      layout: {
        "text-field": ["concat", ["get", "label"], "\n", ["get", "sublabel"]],
        "text-font": [...ZONE_LABEL_FONT],
        "text-size": 7,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-line-height": 1.1,
        "text-padding": 0,
      },
      paint: {
        "text-color": "#a7f3c7",
        "text-halo-color": "rgba(10, 13, 19, 0.9)",
        "text-halo-width": 1.1,
      },
    });
  }

  if (!map.getLayer(DESTINATION_LAYER)) {
    map.addLayer({
      id: DESTINATION_LAYER,
      type: "circle",
      source: DESTINATION_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-color": "#fbbf24",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
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

export function setPnrOverlayData(map: MaplibreMap) {
  ensureMapOverlayLayers(map);
  setSourceData(map, PNR_SOURCE, buildPnrCollection());
}

export function setDestinationOverlayData(
  map: MaplibreMap,
  destination: { lon: number; lat: number } | null,
) {
  ensureMapOverlayLayers(map);
  setSourceData(map, DESTINATION_SOURCE, buildDestinationCollection(destination));
}
