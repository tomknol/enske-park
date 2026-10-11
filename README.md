# EnsKe Park

Mobile-first parking utility for Enschede — zone, current street tariff, RDW garage occupancy, and curated free-parking suggestions on a full-screen map.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_MAP_STYLE_URL` | No | MapLibre style URL (default: OpenFreeMap Liberty) |

## Data sources

- Parking zones: [Gemeente Enschede ArcGIS](https://geoportaal.enschede.nl/arcgis/rest/services/Parkeren_Parkeervergunningzones/MapServer)
- Garages: [RDW NPR Open Data](https://npropendata.rdw.nl/parkingdata/v2/)

Location is processed in the browser only; coordinates are not sent to this app’s server.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
