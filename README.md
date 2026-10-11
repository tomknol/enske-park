# Enske Park

Mobiele parkeerutility voor Enschede: volledige kaart, live parkeerstatus op basis van je locatie, zone-tarieven, countdown, kosteninschatting, garages, P+R en lichte adreszoek.

**Productie:** [enske-park.vercel.app](https://enske-park.vercel.app)

Geen accounts, geen database. GPS en zone-bepaling blijven in de browser.

---

## Wat de app doet

Kaart-first: één donker **statuspaneel** bovenin. Geen bottom sheets of modale backdrops.

### Live status (GPS)

- Zone + tarief + tijd (`tot …` / `vanaf …`)
- **Countdown** in gratis betaalzones (rechts, per seconde)
- **Max. parkeertijd** op straat (waar gemapt), bijv. `MAX. 30 MIN.` op Stationsplein
- Tik op **€ …/u** → compacte **kosteninschatting** (+1/+2/+3 u, tot 18:00), met `±` en waarschuwing bij overschrijding max. duur

### Context in hetzelfde paneel

| Context | Hoe |
| --- | --- |
| **Live GPS** | Standaard |
| **Zone** | Tik op zone op de kaart |
| **Bestemming** | Zoek icoon → adres → gele pin; label “Bestemming” |
| **Garage** | Tik op **P**-marker (RDW, live indien beschikbaar) |
| **P+R Zuiderval** | Tik op **P+R**-marker + Route-link |
| **Info** | Info-knop |

Leeg kaartgebied of ✕ → terug naar live GPS.

**Desktop:** hover over zone = tijdelijke preview (zonder GPS-highlight te vervangen).

### Kaartlagen (visuele prioriteit)

1. GPS-positie  
2. Huidige zone (highlight)  
3. Betaalzones + zone-nummers  
4. **Autoluwe binnenstad** (magenta lijn, indicatief — geen officiële GIS)  
5. Garages (**P** / **P 184** / **P VOL**)  
6. **P+R Zuiderval** (`P+R` + €3)  
7. Vergunningzones (rustig)  
8. Zoek-bestemming (gele pin)

Attributie linksonder: © OpenStreetMap · OpenFreeMap.

### Tarieven & tijden (2026)

Bron: `src/lib/tariffs.ts`.

| Zones | Uurtarief | Betaald (indicatie) |
| --- | --- | --- |
| 1, 1B | € 3,85 | ma–za 09:00–23:00, zo 13:00–23:00 |
| 2 t/m 8 | € 3,45 | ma–za 09:00–19:00, zo 13:00–19:00 |

Tijdzone: **Europe/Amsterdam**.

### Nederlandse feestdagen (Enschede)

Expliciet in `src/lib/holidays-nl.ts` + `src/lib/parking-schedule.ts`:

**Hele dag gratis:** Nieuwjaar, Eerste Paasdag, Eerste Pinksterdag, Eerste Kerstdag.

**Zondagschema (niet hele dag gratis):** Goede Vrijdag, Tweede Paasdag, Koningsdag, Bevrijdingsdag, Hemelvaart, Tweede Pinksterdag, Tweede Kerstdag.

Status, countdown, kosteninschatting en `tot`/`vanaf` gebruiken dezelfde regels.

### Straat-maximumduur

Configuratie: `src/data/duration-restrictions-data.ts` (polygonen, geen zone-brede regels).

Momenteel geverifieerd opgenomen: **Stationsplein (30 min)**. Meer straten alleen toevoegen met betrouwbare geometrie + bron.

### P+R Zuiderval

`src/lib/pnr-zuiderval.ts` — € 3 per dag, bus naar centrum max. 5 personen (bron: [enschede.nl](https://www.enschede.nl/parkeertarieven-en-parkeerlocaties)).

### Duitse feestdag

Hint NRW/Niedersachsen (`holidays-de.ts`). Bij Duitse feestdag + ≥2 live drukke centrumgarages: “Extra druk in centrum”.

---

## API’s

| Route | Functie |
| --- | --- |
| `GET /api/zones` | Gemeente ArcGIS → GeoJSON |
| `GET /api/garages` | RDW NPR static + dynamic |
| `GET /api/geocode` | Nominatim-proxy (Enschede) |
| `GET /api/overlays` | Max-duur + stadserf JSON |

---

## Technische stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · MapLibre 6 · Turf · date-fns-tz · Vitest.

---

## Projectstructuur (kern)

```
src/
├── app/api/          # zones, garages, geocode, overlays
├── components/       # enske-park-app, parking-map, parking-context-panel, map-search-control
├── data/             # duration-restrictions-data, stadserf-boundary-data
├── lib/
│   ├── tariffs.ts
│   ├── holidays-nl.ts / holidays-de.ts
│   ├── parking-schedule.ts
│   ├── parking-status.ts
│   ├── parking-cost-estimator.ts
│   ├── duration-restrictions.ts
│   ├── garages.ts / pnr-zuiderval.ts
│   └── panel-context.ts
```

---

## Setup

```bash
npm install
npm run dev
```

```bash
npm test          # Vitest: feestdagen, betaalvensters, estimator
npm run build
```

Optioneel: `NEXT_PUBLIC_MAP_STYLE_URL` (zie `.env.example`).

---

## Onderhoud

1. **Tarieven/tijden:** `tariffs.ts`  
2. **Feestdagen:** `holidays-nl.ts` (soorten blijven leidend)  
3. **Max. duur straten:** `duration-restrictions-data.ts` + bronvermelding  
4. **Stadserf-lijn:** `stadserf-boundary-data.ts` (bijwerken als officiële vector beschikbaar komt)  
5. **P+R / garages:** `pnr-zuiderval.ts`, `garages.ts`, RDW-id’s  

---

## Disclaimer

Hulpmiddel op basis van open data. **Borden en officiële aanwijzingen ter plaatse zijn leidend.**

Versie: `package.json` → `version` (nu `1.0`).
