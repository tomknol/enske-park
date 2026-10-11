/** Curated suggestions outside municipal paid-zone polygons (verified against GIS). */

export type FreeParkingSpot = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  note: string;
};

/** Oude Markt reference for walking estimates. */
export const CENTRE_OUDE_MARKT = { lon: 6.8937, lat: 52.2215 };

export const FREE_PARKING_SPOTS: FreeParkingSpot[] = [
  {
    id: "boddenkamp",
    name: "Boddenkampsingel (buiten betaalzone)",
    lon: 6.8775,
    lat: 52.2368,
    note: "Straatparkeren buiten de singel. Geen winkelparkering.",
  },
  {
    id: "lasondersingel",
    name: "Lasondersingel (west)",
    lon: 6.872,
    lat: 52.229,
    note: "Gratis straatparkeren buiten het betaald parkeergebied.",
  },
  {
    id: "laaressingel",
    name: "Laaressingel",
    lon: 6.881,
    lat: 52.233,
    note: "Buiten de gemeentelijke betaalzones; controleer parkeervakken ter plaatse.",
  },
  {
    id: "woolderkoers",
    name: "Woolderkoers",
    lon: 6.865,
    lat: 52.248,
    note: "Verder van het centrum; vaak rustiger straatparkeren.",
  },
];

export function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
}
