import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { hoverMotionId, panelMotionKey } from "@/lib/panel-motion";
import type { GarageMarkerData } from "@/lib/garages";
import { resolveParkingAtLocation } from "@/lib/parking-status";

const TZ = "Europe/Amsterdam";

function ams(y: number, m: number, d: number, h: number, min = 0, sec = 0): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${y}-${p(m)}-${p(d)}T${p(h)}:${p(min)}:${p(sec)}`, TZ);
}

function zoneKey(paid: boolean) {
  return panelMotionKey({
    error: false,
    hover: null,
    context: "zone:paid:4",
    paid,
    accessOpen: null,
    geo: "ok",
  });
}

describe("panel motion key", () => {
  it("stays stable across a countdown tick and changes when paid hours start", () => {
    const free = resolveParkingAtLocation("paid", "4", ams(2026, 10, 12, 8, 0, 1));
    const stillFree = resolveParkingAtLocation("paid", "4", ams(2026, 10, 12, 8, 0, 2));
    const paid = resolveParkingAtLocation("paid", "4", ams(2026, 10, 12, 10, 0, 0));
    expect(free.isPaidNow).toBe(false);
    expect(stillFree.isPaidNow).toBe(false);
    expect(paid.isPaidNow).toBe(true);
    expect(zoneKey(free.isPaidNow)).toBe(zoneKey(stillFree.isPaidNow));
    expect(zoneKey(paid.isPaidNow)).not.toBe(zoneKey(free.isPaidNow));
  });

  it("keeps a garage hover identity when only the live count changes", () => {
    const garage = {
      id: "van-heek",
      label: "H.J. van Heekgarage",
      shortLabel: "Van Heek",
      lat: 52.22,
      lon: 6.89,
      vacant: 184,
      capacity: 1700,
      live: true,
      level: "plenty",
      lastUpdated: 1,
    } satisfies GarageMarkerData;
    const later = { ...garage, vacant: 120, lastUpdated: 2 };
    expect(hoverMotionId({ kind: "garage", garage })).toBe(
      hoverMotionId({ kind: "garage", garage: later }),
    );
    expect(hoverMotionId({ kind: "stadserf-access", id: "de-heurne" })).toBe(
      "access:de-heurne",
    );
    expect(hoverMotionId({ kind: "outside" })).toBe("outside");
  });
});
