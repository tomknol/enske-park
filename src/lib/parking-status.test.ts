import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import {
  composePanelSecondary,
  resolveParkingAtLocation,
  statusPanelColumns,
} from "@/lib/parking-status";

const TZ = "Europe/Amsterdam";

function ams(y: number, m: number, d: number, h: number, min = 0): Date {
  const p = (n: number) => String(n).padStart(2, "0");
  return fromZonedTime(`${y}-${p(m)}-${p(d)}T${p(h)}:${p(min)}:00`, TZ);
}

describe("status panel columns", () => {
  it("keeps Sunday 21:00 Zone 1 as paid until 23:00", () => {
    const now = ams(2026, 10, 11, 21);
    const columns = statusPanelColumns(resolveParkingAtLocation("paid", "1", now), now);
    expect(columns.left).toBe("tot 23:00");
    expect(columns.center).toBe("ZONE 1");
    expect(columns.right).toBe("€ 3,85/u");
    expect(columns.rightMode).toBe("rate");
    expect(columns.fact).toBe("Betaald parkeren");
  });

  it("keeps Sunday 21:00 Zone 1B as paid until 23:00", () => {
    const now = ams(2026, 10, 11, 21);
    const columns = statusPanelColumns(resolveParkingAtLocation("paid", "1B", now), now);
    expect(columns.left).toBe("tot 23:00");
    expect(columns.center).toBe("ZONE 1B");
    expect(columns.right).toBe("€ 3,85/u");
  });

  it("shows Zone 6 free after Sunday paid hours with countdown in the fact line", () => {
    const now = ams(2026, 10, 11, 21);
    const snap = resolveParkingAtLocation("paid", "6", now);
    const columns = statusPanelColumns(snap, now);
    expect(columns.left).toBe("vanaf morgen 09:00");
    expect(columns.center).toBe("ZONE 6");
    expect(columns.right).toBe("GRATIS");
    expect(columns.rightMode).toBe("free");
    expect(columns.fact).toMatch(/^Nog \d+:\d{2}:\d{2} gratis$/);
    expect(snap.paidStartsAt).not.toBeNull();
  });

  it("treats Zone 8 the same as Zone 6 outside paid hours", () => {
    const now = ams(2026, 10, 11, 21);
    const six = statusPanelColumns(resolveParkingAtLocation("paid", "6", now), now);
    const eight = statusPanelColumns(resolveParkingAtLocation("paid", "8", now), now);
    expect(eight.left).toBe(six.left);
    expect(eight.right).toBe("GRATIS");
    expect(eight.center).toBe("ZONE 8");
    expect(eight.fact).toMatch(/^Nog \d+:\d{2}:\d{2} gratis$/);
  });

  it("never invents a paid start outside every zone", () => {
    const now = ams(2026, 10, 11, 21);
    const snap = resolveParkingAtLocation("outside", null, now);
    const columns = statusPanelColumns(snap, now);
    expect(columns.left).toBe("—");
    expect(columns.center).toBe("GEEN BETAALZONE");
    expect(columns.right).toBe("GRATIS");
    expect(columns.fact).toBe("Volgens gemeentelijke zonekaart");
    expect(snap.paidStartsAt).toBeNull();
    expect(columns.fact).not.toMatch(/Nog /);
  });

  it("uses weekday rates and paid-until times during paid hours", () => {
    const now = ams(2026, 3, 11, 15);
    const one = statusPanelColumns(resolveParkingAtLocation("paid", "1", now), now);
    const four = statusPanelColumns(resolveParkingAtLocation("paid", "4", now), now);
    expect(one.right).toBe("€ 3,85/u");
    expect(one.left).toBe("tot 23:00");
    expect(four.right).toBe("€ 3,45/u");
    expect(four.left).toBe("tot 19:00");
  });

  it("keeps permit columns stable", () => {
    const now = ams(2026, 10, 11, 21);
    const known = statusPanelColumns(resolveParkingAtLocation("permit", "3", now), now);
    const unknown = statusPanelColumns(resolveParkingAtLocation("permit", null, now), now);
    expect(known).toMatchObject({
      left: "24/7",
      center: "ZONE 3",
      right: "VERGUNNING",
      fact: "Alleen vergunninghouders",
    });
    expect(unknown.center).toBe("VERGUNNING");
    expect(unknown.right).toBe("VERGUNNING");
  });

  it("uses the shared holiday schedule for a full-free day", () => {
    const now = ams(2026, 1, 1, 12);
    const columns = statusPanelColumns(resolveParkingAtLocation("paid", "1", now), now);
    expect(columns.right).toBe("GRATIS");
    expect(columns.left).toBe("vanaf morgen 09:00");
    expect(columns.fact).toMatch(/^Nog \d+:\d{2}:\d{2} gratis$/);
  });

  it("marks hover and selected context without changing the three columns", () => {
    const now = ams(2026, 10, 11, 21);
    const columns = statusPanelColumns(resolveParkingAtLocation("paid", "8", now), now);
    expect(composePanelSecondary({ context: "hover", fact: columns.fact })).toBe(
      `Zone onder muis · ${columns.fact}`,
    );
    expect(
      composePanelSecondary({ context: "selected", fact: "Betaald parkeren" }),
    ).toBe("Geselecteerde zone · Betaald parkeren");
    expect(columns.right).toBe("GRATIS");
    expect(columns.left).toBe("vanaf morgen 09:00");
  });
});
