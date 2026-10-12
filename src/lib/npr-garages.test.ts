import { describe, expect, it } from "vitest";
import { garageMarkerText, garagePanelCopy } from "@/lib/garages";
import {
  ENSCHEDE_GARAGES,
  interpretGarageDynamic,
  matchNprFacility,
  resolveEnschedeGarage,
} from "@/lib/npr-garages";

const VAN_HEEK = ENSCHEDE_GARAGES[0];
const NOW = Date.parse("2026-10-12T21:20:00Z");
const FRESH = String(Math.floor((NOW - 30_000) / 1000));
const STALE = "1751870873";

function dynamicPayload(overrides: Record<string, unknown> = {}) {
  return {
    parkingFacilityDynamicInformation: {
      identifier: VAN_HEEK.id,
      facilityActualStatus: {
        lastUpdated: FRESH,
        parkingCapacity: "1700",
        vacantSpaces: "184",
        full: false,
        open: true,
        ...overrides,
      },
    },
  };
}

describe("NPR dynamic occupancy", () => {
  it("reads a fresh free-space count for the matching facility", () => {
    const reading = interpretGarageDynamic({
      payload: dynamicPayload(),
      expectedId: VAN_HEEK.id,
      capacity: 1700,
      now: NOW,
    });
    expect(reading).toMatchObject({
      matched: true,
      freeSpaces: 184,
      capacity: 1700,
      isOpen: true,
      live: true,
    });
  });

  it("treats a fresh zero as full", () => {
    const reading = interpretGarageDynamic({
      payload: dynamicPayload({ vacantSpaces: "0", full: true }),
      expectedId: VAN_HEEK.id,
      capacity: 1700,
      now: NOW,
    });
    expect(reading.live).toBe(true);
    expect(reading.freeSpaces).toBe(0);
  });

  it("drops a stale timestamp instead of keeping the old count", () => {
    const reading = interpretGarageDynamic({
      payload: dynamicPayload({ lastUpdated: STALE, vacantSpaces: "1464" }),
      expectedId: VAN_HEEK.id,
      capacity: 1700,
      now: NOW,
    });
    expect(reading.live).toBe(false);
    expect(reading.freeSpaces).toBeNull();
    expect(reading.updatedAt).toBe(Number(STALE) * 1000);
  });

  it("returns no live count when dynamic data is missing", () => {
    const garage = resolveEnschedeGarage({
      catalog: VAN_HEEK,
      staticPayload: null,
      dynamicPayload: null,
      now: NOW,
    });
    expect(garage.live).toBe(false);
    expect(garage.freeSpaces).toBeNull();
    expect(garage.latitude).toBe(VAN_HEEK.fallbackLatitude);
    expect(garage.longitude).toBe(VAN_HEEK.fallbackLongitude);
  });

  it("falls back when the dynamic response is malformed", () => {
    expect(
      interpretGarageDynamic({
        payload: "{not json",
        expectedId: VAN_HEEK.id,
        capacity: 1700,
        now: NOW,
      }).live,
    ).toBe(false);
    expect(
      interpretGarageDynamic({
        payload: dynamicPayload({ vacantSpaces: "nope" }),
        expectedId: VAN_HEEK.id,
        capacity: 1700,
        now: NOW,
      }),
    ).toMatchObject({ live: false, freeSpaces: null, matched: true });
  });

  it("rejects a free-space count above capacity", () => {
    const reading = interpretGarageDynamic({
      payload: dynamicPayload({ vacantSpaces: "1800", parkingCapacity: "1700" }),
      expectedId: VAN_HEEK.id,
      capacity: 1700,
      now: NOW,
    });
    expect(reading.live).toBe(false);
    expect(reading.freeSpaces).toBeNull();
  });

  it("does not apply another facility's occupancy", () => {
    const irene = ENSCHEDE_GARAGES[1];
    const reading = interpretGarageDynamic({
      payload: dynamicPayload({ vacantSpaces: "27" }),
      expectedId: irene.id,
      capacity: 475,
      now: NOW,
    });
    expect(reading.matched).toBe(false);
    expect(reading.freeSpaces).toBeNull();
    expect(reading.live).toBe(false);
  });

  it("matches a facility by its official identifier", () => {
    const facilities = [
      { identifier: "other", dynamicDataUrl: "https://example.test/other" },
      { identifier: VAN_HEEK.id, dynamicDataUrl: "https://npropendata.rdw.nl/dynamic" },
    ];
    expect(matchNprFacility(facilities, VAN_HEEK.id)?.dynamicDataUrl).toBe(
      "https://npropendata.rdw.nl/dynamic",
    );
    expect(matchNprFacility(facilities, "missing")).toBeNull();
  });

  it("reads a fresh SPDP vacant-space value from XML", () => {
    const xml = `
      <parkingFacilityStatus>
        <facilityReference>${VAN_HEEK.id}</facilityReference>
        <totalNumberOfVacantParkingSpaces>27</totalNumberOfVacantParkingSpaces>
        <parkingFacilityStatusTime>${new Date(NOW - 20_000).toISOString()}</parkingFacilityStatusTime>
      </parkingFacilityStatus>
    `;
    const reading = interpretGarageDynamic({
      payload: xml,
      expectedId: VAN_HEEK.id,
      capacity: 1700,
      now: NOW,
    });
    expect(reading).toMatchObject({ live: true, freeSpaces: 27 });
  });
});

describe("garage marker text", () => {
  it("shows the free-space count when it is live", () => {
    expect(garageMarkerText(184, true)).toBe("P 184");
  });

  it("shows VOL when a fresh garage has no free spaces", () => {
    expect(garageMarkerText(0, true)).toBe("P VOL");
  });

  it("shows only P when occupancy is unavailable", () => {
    expect(garageMarkerText(null, false)).toBe("P");
    expect(garageMarkerText(184, false)).toBe("P");
  });
});

describe("garage panel copy", () => {
  it("shows free spaces and the update time when the count is live", () => {
    expect(
      garagePanelCopy({
        id: VAN_HEEK.id,
        label: VAN_HEEK.label,
        shortLabel: VAN_HEEK.shortLabel,
        lat: VAN_HEEK.fallbackLatitude,
        lon: VAN_HEEK.fallbackLongitude,
        vacant: 184,
        capacity: 1700,
        live: true,
        level: "plenty",
        lastUpdated: Date.parse("2026-10-12T12:32:00Z"),
      }),
    ).toEqual({
      left: "GARAGE",
      center: "VAN HEEK",
      right: "184 VRIJ",
      secondary: "1.700 plaatsen · bijgewerkt 14:32",
    });
  });

  it("does not present a missing count as live", () => {
    expect(
      garagePanelCopy({
        id: VAN_HEEK.id,
        label: VAN_HEEK.label,
        shortLabel: VAN_HEEK.shortLabel,
        lat: VAN_HEEK.fallbackLatitude,
        lon: VAN_HEEK.fallbackLongitude,
        vacant: null,
        capacity: 1700,
        live: false,
        level: "unknown",
        lastUpdated: Number(STALE) * 1000,
      }),
    ).toEqual({
      left: "GARAGE",
      center: "VAN HEEK",
      right: "PARKEREN",
      secondary: "Live bezetting niet beschikbaar",
    });
  });
});
