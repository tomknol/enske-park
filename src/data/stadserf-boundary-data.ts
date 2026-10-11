import type { FeatureCollection, LineString } from "geojson";

/**
 * Official Enschede city-centre restricted-access boundary.
 *
 * Source geometry: NDW emission-zones GeoJSON, feature "ZE Enschede".
 * The municipality states that the voetgangerszone / stadserf IS this
 * zero-emission zone (enschede.nl/zero-emissiezone, since 1 July 2025).
 *
 * Stored as the exterior ring only (one closed LineString; no holes).
 * Previous hand-sketched loop sat too far north inside Zone 1 and is not used.
 */
export const stadserfBoundaryData: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "voetgangerszone-binnenstad",
        label: "Autoluwe binnenstad",
        source: "NDW emissiezones — ZE Enschede (gmb-2025-154132)",
        sourceUrl: "https://data.ndw.nu/api/rest/static-road-data/emission-zones/v1/map",
        municipalUrl: "https://www.enschede.nl/zero-emissiezone",
        geometryNote:
          "Exterior ring of the official zero-emission / stadserf zone. Update from NDW if the municipal boundary changes.",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [6.899886, 52.216291],
          [6.900015, 52.216373],
          [6.900111, 52.216853],
          [6.900101, 52.216978],
          [6.90016, 52.217556],
          [6.900047, 52.218401],
          [6.899467445754308, 52.218582027730946],
          [6.899203720057153, 52.219279034065124],
          [6.899755884775934, 52.21934074548889],
          [6.899908, 52.219525],
          [6.899854, 52.219834],
          [6.899961, 52.220445],
          [6.899768, 52.220669],
          [6.899745346391257, 52.22082983336023],
          [6.899383686485802, 52.22082960711371],
          [6.899428319716196, 52.22120213428764],
          [6.899704722561305, 52.22121439855762],
          [6.899822, 52.221286],
          [6.899725, 52.221654],
          [6.899414, 52.222187],
          [6.8981, 52.222376],
          [6.897794, 52.222456],
          [6.896769, 52.222507],
          [6.895404, 52.222327],
          [6.895058, 52.222668],
          [6.893946641314073, 52.222709920321726],
          [6.892908909948304, 52.222582894323764],
          [6.8929702981441405, 52.22231990087441],
          [6.892784954974848, 52.22230341258399],
          [6.8926126863412565, 52.22228291966337],
          [6.8926348804371145, 52.22168270968009],
          [6.892467493763415, 52.22167520605386],
          [6.892237856786018, 52.22137486046933],
          [6.891988608003065, 52.22104648017677],
          [6.8920457782275255, 52.2208863179764],
          [6.8913385801715155, 52.22077708612629],
          [6.891360588322602, 52.22047280427262],
          [6.891566375727236, 52.21998127808463],
          [6.891781774406763, 52.219814080646394],
          [6.892012095976706, 52.21974764357252],
          [6.892092, 52.219627],
          [6.892334532927871, 52.21956305518954],
          [6.89239718496004, 52.21908797214579],
          [6.892710225708992, 52.21916337290191],
          [6.892783724135539, 52.21900080065969],
          [6.892961, 52.218923],
          [6.893411, 52.218194],
          [6.893996, 52.218309],
          [6.894296, 52.218053],
          [6.896667, 52.217727],
          [6.896351, 52.216896],
          [6.899886, 52.216291]
        ],
      },
    },
  ],
};
