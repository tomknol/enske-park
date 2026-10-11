import type { FeatureCollection, LineString } from "geojson";

export const stadserfBoundaryData: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "voetgangerszone-binnenstad",
        label: "Autoluwe binnenstad",
        source:
          "Beleidsregel voetgangerszone binnenstad Enschede 2025, bijlage 1 (Zone Binnenstad – juni 2025)",
        sourceUrl: "https://lokaleregelgeving.overheid.nl/CVDR742062/1",
        geometryNote:
          "Indicatieve lijn ter orientatie; geen officiële GIS-laag beschikbaar. Volg de gemeentelijke kaart bij twijfel.",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [6.8918, 52.22335],
          [6.89265, 52.22285],
          [6.89355, 52.22245],
          [6.89485, 52.22215],
          [6.89625, 52.22185],
          [6.89745, 52.22155],
          [6.89815, 52.22095],
          [6.89785, 52.22025],
          [6.89685, 52.21975],
          [6.89555, 52.21955],
          [6.89415, 52.21965],
          [6.89285, 52.22005],
          [6.89155, 52.22065],
          [6.89085, 52.22145],
          [6.8918, 52.22335],
        ],
      },
    },
  ],
};
