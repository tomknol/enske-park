import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { DurationRestrictionProps } from "@/lib/duration-restrictions";

export const durationRestrictionsData: FeatureCollection<
  Polygon | MultiPolygon,
  DurationRestrictionProps
> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "stationsplein",
        name: "Stationsplein",
        maxMinutes: 30,
        source: "Aanwijzingsbesluit parkeren Enschede — Stationsplein, telkens 30 minuten",
        sourceUrl: "https://lokaleregelgeving.overheid.nl/CVDR751914/1",
        geometryNote: "Vlak rond Stationsplein; verifieer tegen borden ter plaatse.",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [6.89335, 52.22195],
            [6.89585, 52.22195],
            [6.89585, 52.22055],
            [6.89335, 52.22055],
            [6.89335, 52.22195],
          ],
        ],
      },
    },
  ],
};
