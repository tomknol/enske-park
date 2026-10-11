# Enske Park

Mobiele parkeerutility voor Enschede: volledige kaart, live parkeerstatus op basis van je locatie en zone-tarieven.

**Productie:** [enske-park.vercel.app](https://enske-park.vercel.app)

Geen accounts, geen database. Alle persoonlijke locatiegegevens blijven in de browser.

---

## Wat de app doet

### Kaart (volledig scherm)

- Donkere MapLibre-kaart (standaard [OpenFreeMap Dark](https://openfreemap.org/)), met parkeerzones en markers erbovenop.
- Kaart is strikt **2D**: geen kanteling, geen rotatie, noord boven.
- **Betaalzones** (gemeente) als gekleurde vlakken; **vergunningzones** apart gestyled.
- **Zone-nummers** op de kaart (groot, leesbaar); de zone waar je nu in staat wordt visueel benadrukt zodra locatie bekend is.
- **Desktop:** zoomknoppen rechtsonder. **Mobiel:** pinchen en slepen.
- Knop **Naar mijn locatie** (rechtsonder): centreert de kaart opnieuw op GPS en hervat “volgen” na handmatig verschuiven.

### Statuspaneel (boven, midden)

Eén compact, donker paneel — de enige informatielaag boven de kaart.

**Standaard:** je **huidige** parkeersituatie (GPS + zone + tarief), typografie-gedreven (zone-label, groot tarief/status, kleine secundaire regel).

**Geselecteerd:** tik op een zone → hetzelfde paneel toont details van die keuze. Sluiten via ✕ of tik op leeg kaartgebied → terug naar je locatiestatus (GPS-logica blijft ongewijzigd).

**Desktop:** beweeg de muis over een zone → het paneel toont een tijdelijke preview (“Zone onder de muis”) zonder je GPS-highlight te vervangen.

| Actie | Resultaat |
| --- | --- |
| Tik op **zone** | Detail in het statuspaneel |
| Tik op **leeg kaartgebied** | Selectie wissen |
| **Info-knop** (rechtsonder) | Korte “Over Enske Park”-tekst in het paneel |

Geen bottom sheet, geen modale backdrop, geen blur over de kaart.

De status wordt elke ~30 seconden herberekend (klok) en bij GPS-updates bijgewerkt.

### Locatie & zones

- **Geolocatie** via `navigator.geolocation` (watch), alleen in de browser.
- GPS-positie wordt met **Turf** getoetst aan gemeentelijke polygonen: betaald, vergunning, of buiten zone.
- **Grens-hysterese:** bij twijfel aan een zonegrens wacht de app op twee opeenvolgende metingen voordat de zone wisselt (minder flikkeren).
- Accuracy-cirkel rond je positie op de kaart.

### Tarieven & tijden (2026)

Logica staat in `src/lib/tariffs.ts` (handmatig bijwerken bij nieuwe tariefjaren):

| Zones | Uurtarief | Betaald (indicatie) |
| --- | --- | --- |
| 1, 1B | € 3,85 | ma–za 09:00–23:00, zo 13:00–23:00 |
| 2 t/m 8 | € 3,45 | ma–za 09:00–19:00, zo 13:00–19:00 |

- Tijdzone: **Europe/Amsterdam**.
- **Nederlandse** feestdagen: gratis parkeren volgens `holidays-nl.ts`.
- **Duitse** feestdagen (NRW / Nedersaksen, relevant voor grensregio): `holidays-de.ts` — hint in het statuspaneel op Duitse feestdagen.

### Server-API’s (Next.js Route Handlers)

| Route | Functie | Cache |
| --- | --- | --- |
| `GET /api/zones` | Haalt ArcGIS-lagen op (vergunning + betaald), levert GeoJSON | ~1 uur revalidate |

Zones worden bij start (en na fout opnieuw) geladen.

---

## Technische stack

| Onderdeel | Technologie |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Taal | TypeScript |
| Styling | Tailwind CSS v4, custom “dark liquid” tokens in `globals.css` |
| UI | Lucide-iconen, één statuspaneel (geen drawer/modal) |
| Kaart | MapLibre GL JS 6 |
| Geo | Turf.js, GeoJSON |
| Datum/tijd | date-fns, date-fns-tz |
| Font | DM Sans (Google Fonts) |

**Niet aanwezig:** database, login, analytics-backend, eigen kaarttegels.

---

## Projectstructuur

```
src/
├── app/
│   ├── page.tsx              # Enige pagina → EnskeParkApp
│   ├── layout.tsx            # Metadata, viewport, font
│   ├── globals.css           # Design tokens, kaart/sheet/island styling
│   ├── vaul-drawer.css       # Drawer-animaties (lokaal i.p.v. vaul npm CSS)
│   └── api/
│       └── zones/route.ts    # Proxy + normalisatie gemeente GeoJSON
├── components/
│   ├── enske-park-app.tsx       # Shell: data, selectedMapFeature, kaart
│   ├── parking-context-panel.tsx # Enkel statuspaneel (locatie + selectie)
│   ├── parking-map.tsx          # MapLibre: lagen, markers, klik-handlers
│   └── ui/button.tsx
├── hooks/
│   ├── use-geolocation.ts
│   └── use-stable-user-zone.ts
└── lib/
    ├── tariffs.ts            # Tarieven & parkeertijden (bron van waarheid)
    ├── parking-status.ts     # “Betaald nu?” + sheet-teksten
    ├── zones.ts              # Polygon lookup, kleuren
    ├── zone-labels.ts        # Labelpunten & nadruk huidige zone
    ├── zone-map-highlight.ts # Feature-state: current / hover / selected
    ├── holidays-nl.ts / holidays-de.ts
    └── map-theme.ts          # Standaard style-URL
public/
└── icon.svg                  # App-icoon
```

---

## Privacy

- GPS-coördinaten worden **niet** naar deze app-server gestuurd.
- Alleen de browser vraagt locatie aan; zone-bepaling gebeurt client-side met lokaal opgehaalde polygonen.
- Server-aanroepen gaan naar **gemeente ArcGIS** (zones), niet naar een eigen user-API.

---

## Setup (lokaal)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Locatie werkt alleen op **HTTPS** of **localhost** (browserbeleid).

---

## Omgevingsvariabelen

| Variabele | Verplicht | Beschrijving |
| --- | --- | --- |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Nee | MapLibre style JSON-URL. Standaard: `https://tiles.openfreemap.org/styles/dark` |

Voorbeeld: `.env.example`

---

## Scripts

| Commando | Doel |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Productiebuild |
| `npm run start` | Productieserver na build |
| `npm run lint` | ESLint |

---

## Deployment

Gehost op **Vercel** (project gekoppeld aan GitHub `tomknol/enske-park`). Geen secrets vereist voor basisfunctionaliteit; optioneel alleen `NEXT_PUBLIC_MAP_STYLE_URL`.

Na deploy: metadata en `metadataBase` wijzen naar `https://enske-park.vercel.app`.

---

## Onderhoud

1. **Nieuwe parkeertarieven / tijden:** pas `src/lib/tariffs.ts` aan (`TARIFF_YEAR`, bedragen, schema’s).
2. **Andere kaartstijl:** zet `NEXT_PUBLIC_MAP_STYLE_URL` (lokaal en op Vercel).
---

## Externe databronnen

- **Parkeer- en vergunningzones:** [Gemeente Enschede ArcGIS MapServer](https://geoportaal.enschede.nl/arcgis/rest/services/Parkeren_Parkeervergunningzones/MapServer) (lagen 0 en 1)
- **Basiskaart:** [OpenFreeMap](https://openfreemap.org/) (standaard dark style; © OpenMapTiles / OpenStreetMap via attributie op kaart)

**Disclaimer:** Enske Park is een hulpmiddel op basis van open data. **Borden, bordjes en officiële aanwijzingen ter plaatse zijn altijd leidend.**

---

## Versie

Applicatieversie: **`package.json` → `version`** (semver, nu `1.0`).
