# Enske Park

Kaart van de parkeerzones in Enschede: zie waar de zones zitten, plus live parkeerstatus op basis van je locatie, tarieven, countdown, kosteninschatting, garages en lichte adreszoek.

**Productie:** [enske-park.vercel.app](https://enske-park.vercel.app)

Geen accounts, geen database. GPS en zone-bepaling blijven in de browser.

---

## Wat de app doet

Kaart-first: één donker **statuspaneel** bovenin. Geen bottom sheets of modale backdrops.

### Live status (GPS)

Het paneel houdt altijd dezelfde kolommen:

| Links | Midden | Rechts |
| --- | --- | --- |
| wanneer de staat wijzigt (`tot …` / `vanaf …` / `—` / `24/7`) | welke zone of locatie | wat **nu** geldt (`€ …/u` / `GRATIS` / `VERGUNNING`) |

- **Countdown** staat in de secundaire regel (`Nog … gratis`), nooit in de rechterkolom
- Buiten elke betaalzone: `— · GEEN BETAALZONE · GRATIS` — geen toekomstige starttijd
- **Max. parkeertijd** op straat (waar gemapt), bijv. `MAX. 30 MIN.` op Stationsplein
- Tik op **€ …/u** → compacte **kosteninschatting** (+1/+2/+3 u, tot 18:00), met `±` en waarschuwing bij overschrijding max. duur
- Borden ter plaatse blijven leidend (info-paneel)

### Context in hetzelfde paneel

| Context | Hoe |
| --- | --- |
| **Live GPS** | Standaard, zonder prefix |
| **Zone** | Tik op zone · secundair “Geselecteerde zone · …” + ✕ |
| **Punt buiten zone** | Tik op leeg kaartgebied · “Geselecteerde locatie · …” + ✕ |
| **Hover** | Desktop, tijdelijk · secundair “Zone onder muis · …” (geen ✕) |
| **Bestemming** | Zoek icoon → adres → gele pin · “Bestemming · …” |
| **Garage** | Tik op de blauwe **P**-marker. `P 184` is het aantal vrije plaatsen via RDW/NPR, alleen als die telling jonger is dan 5 minuten |
| **Stadserf** | Tik in de voetgangerszone · `STADSERF` + venstertijd of ontheffing. Gaat vóór Zone 1. |
| **Toegang Stadserf** | Tik op een magenta openingsmarker op de grens · straat + in-/uitgang + dezelfde venstertijd/ontheffing |
| **Info** | Info-knop |

✕ of de locatieknop → terug naar live GPS. Hover verlaat de zone → terug naar live GPS.

### Kaartlagen (visuele prioriteit)

1. GPS-positie  
2. Huidige zone (highlight)  
3. Betaalzones + zone-nummers  
4. **Autoluwe binnenstad / stadserf** (zachte paarse tint + magenta stippellijn — tikbaar binnengebied)  
5. **Stadserf-toegangen** (compacte magenta markeringen op de grens, zichtbaar op elk zoomniveau; straatnaam alleen dichtbij)  
6. Garages (**P** / **P 184** / **P VOL**)  
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

### Stadserf / voetgangerszone binnenstad

Regels: `src/lib/stadserf.ts` (leges jaarlijks bijwerken). Geometrie: `src/data/stadserf-boundary-data.ts`.

Bron: [Toegang en parkeren binnenstad](https://www.enschede.nl/toegang-en-parkeren-binnenstad).

- Zonder ontheffing: **07:00–11:00** (Europe/Amsterdam) alleen **laden/lossen** — geen gratis parkeren
- Daarbuiten: **ontheffing** vereist. Dagontheffing toegang **€ 17,25**, 30 uur geldig (00:00–06:00 de volgende ochtend)
- Deze ontheffing geeft **geen parkeerrecht**
- Voertuigopeningen: `src/data/stadserf-access-points-data.ts` — punten liggen op de grens (OSM-straat ∩ ring), richting uit de gemeentelijke toegangskaart / bebording 2025

Live GPS in het stadserf toont deze toegangstatus in plaats van `€ 3,85/u` van Zone 1.

### Duitse feestdag

Hint NRW/Niedersachsen (`holidays-de.ts`). Bij Duitse feestdag + ≥2 live drukke centrumgarages: “Extra druk in centrum”.

---

## API’s

| Route | Functie |
| --- | --- |
| `GET /api/zones` | Gemeente ArcGIS → GeoJSON |
| `GET /api/garages` | RDW / Nationaal Parkeerregister. Vrije plaatsen alleen bij een telling jonger dan 5 minuten |
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
├── data/             # duration-restrictions-data, stadserf-boundary-data, stadserf-access-points-data
├── lib/
│   ├── tariffs.ts
│   ├── holidays-nl.ts / holidays-de.ts
│   ├── parking-schedule.ts
│   ├── parking-status.ts
│   ├── parking-cost-estimator.ts
│   ├── duration-restrictions.ts
│   ├── garages.ts / stadserf.ts
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
4. **Stadserf:** `stadserf.ts` (venstertijd + € dagontheffing), `stadserf-boundary-data.ts` (NDW `ZE Enschede`-polygoon) en `stadserf-access-points-data.ts` (voertuigopeningen op de grens).  
5. **Garages:** `npr-garages.ts` (Enschede-faciliteiten 153_HEEK, 153_IRE, 153_MOO, 153_STAT, 153_HERM, 153_BROU) en `garages.ts`  

---

## Disclaimer

Hulpmiddel op basis van open data. **Borden en officiële aanwijzingen ter plaatse zijn leidend.**

Versie: `package.json` → `version` (nu `1.0`).
