import type { StadserfAccessPoint } from "@/lib/stadserf-access";

/**
 * Official vehicle openings of the Enschede Stadserf / voetgangerszone.
 *
 * Coordinates are the intersection of the named OSM highway with the
 * existing NDW ZE Enschede / Stadserf ring — the boundary-crossing, not
 * a street centroid. Pedestrian-only portals and vaste palen are omitted.
 *
 * Direction comes from Gemeente Enschede “Bebording toegangswegen” (2025):
 * each of these seven toegangswegen has both “Binnenstad in” and
 * “Binnenstad uit” signage. The 2020 “Kaart toegangen stadserf Enschede”
 * marks the same openings as “entree met rijrichting” (green). Direction
 * is not inferred from OSM oneway tags or road geometry.
 */
export const stadserfAccessPointsData: readonly StadserfAccessPoint[] = [
  {
    id: "korte-hengelosestraat",
    name: "Korte Hengelosestraat",
    lon: 6.8929173,
    lat: 52.2223152,
    direction: "both",
    source:
      "OSM Korte Hengelosestraat ∩ NDW ZE Enschede ring; Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "van-lochemstraat",
    name: "Van Lochemstraat",
    lon: 6.8981192,
    lat: 52.2223732,
    direction: "both",
    source:
      "OSM Van Lochemstraat ∩ NDW ZE Enschede ring; Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "de-heurne",
    name: "De Heurne",
    lon: 6.8994373,
    lat: 52.222147,
    direction: "both",
    source:
      "OSM De Heurne ∩ NDW ZE Enschede ring (NE opening); Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "de-klomp",
    name: "De Klomp",
    lon: 6.8999057,
    lat: 52.2195222,
    direction: "both",
    source:
      "OSM De Klomp ∩ NDW ZE Enschede ring; Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "kalandergang",
    name: "Kalandergang",
    lon: 6.8999924,
    lat: 52.2184181,
    direction: "both",
    source:
      "OSM Kalandergang ∩ NDW ZE Enschede ring; Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "nijverheidstraat",
    name: "Nijverheidstraat",
    lon: 6.8920808,
    lat: 52.2196439,
    direction: "both",
    source:
      "OSM Nijverheidstraat ∩ NDW ZE Enschede ring (politiebureau); Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
  {
    id: "brammelerstraat",
    name: "Brammelerstraat",
    lon: 6.8920308,
    lat: 52.2209282,
    direction: "both",
    source:
      "OSM Brammelerstraat ∩ NDW ZE Enschede ring; Kaart toegangen stadserf Enschede (sept 2020); bebording toegangswegen 2025 (exb-2025-42002) Binnenstad in + uit",
  },
];
