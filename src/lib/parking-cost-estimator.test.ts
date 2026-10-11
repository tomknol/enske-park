import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { classifyNlHoliday } from "@/lib/holidays-nl";
import { estimateParkingCost } from "@/lib/parking-cost-estimator";
import { isWithinPaidWindow } from "@/lib/parking-schedule";
import { resolveParkingAtLocation } from "@/lib/parking-status";

const TZ = "Europe/Amsterdam";

function ams(y: number, m: number, d: number, h: number, min = 0): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${y}-${p(m)}-${p(d)}T${p(h)}:${p(min)}:00`, TZ);
}

describe("Dutch holidays Enschede", () => {
  it("marks full-free holidays", () => {
    expect(classifyNlHoliday(ams(2026, 1, 1, 12))?.kind).toBe("full_free");
    expect(classifyNlHoliday(ams(2026, 4, 5, 12))?.kind).toBe("full_free");
    expect(classifyNlHoliday(ams(2026, 5, 24, 12))?.kind).toBe("full_free");
    expect(classifyNlHoliday(ams(2026, 12, 25, 12))?.kind).toBe("full_free");
  });

  it("marks sunday-schedule holidays", () => {
    expect(classifyNlHoliday(ams(2026, 4, 3, 12))?.kind).toBe("sunday_schedule");
    expect(classifyNlHoliday(ams(2026, 4, 6, 12))?.kind).toBe("sunday_schedule");
    expect(classifyNlHoliday(ams(2026, 4, 27, 12))?.kind).toBe("sunday_schedule");
    expect(classifyNlHoliday(ams(2026, 5, 14, 12))?.kind).toBe("sunday_schedule");
    expect(classifyNlHoliday(ams(2026, 5, 25, 12))?.kind).toBe("sunday_schedule");
    expect(classifyNlHoliday(ams(2026, 12, 26, 12))?.kind).toBe("sunday_schedule");
  });
});

describe("paid windows", () => {
  it("zone 1 paid on weekday afternoon", () => {
    const t = ams(2026, 3, 11, 15);
    expect(isWithinPaidWindow("1", t)).toBe(true);
    expect(resolveParkingAtLocation("paid", "1", t).isPaidNow).toBe(true);
  });

  it("zone 4 paid on weekday afternoon", () => {
    const t = ams(2026, 3, 11, 15);
    expect(isWithinPaidWindow("4", t)).toBe(true);
  });

  it("zone 4 free after 19:00 weekday", () => {
    const t = ams(2026, 3, 11, 20);
    expect(isWithinPaidWindow("4", t)).toBe(false);
  });

  it("uses sunday hours on regular sunday", () => {
    const t = ams(2026, 3, 15, 12);
    expect(isWithinPaidWindow("4", t)).toBe(false);
    const afternoon = ams(2026, 3, 15, 15);
    expect(isWithinPaidWindow("4", afternoon)).toBe(true);
  });
});

describe("cost estimator", () => {
  it("charges within paid period", () => {
    const from = ams(2026, 3, 11, 15);
    const until = ams(2026, 3, 11, 17);
    const r = estimateParkingCost({ zone: "1", from, until });
    expect(r.totalEur).toBeCloseTo(7.7, 1);
  });

  it("stops at end of paid window", () => {
    const from = ams(2026, 3, 11, 18);
    const until = ams(2026, 3, 11, 22);
    const r = estimateParkingCost({ zone: "4", from, until });
    expect(r.paidMinutes).toBeCloseTo(60, 0);
  });

  it("warns on duration restriction", () => {
    const from = ams(2026, 3, 11, 15);
    const until = ams(2026, 3, 11, 18);
    const r = estimateParkingCost({
      zone: "1",
      from,
      until,
      lon: 6.8945,
      lat: 52.2212,
    });
    expect(r.durationWarning).toMatch(/Maximaal 30 minuten/i);
  });
});
