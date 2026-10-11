import { addDays, format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  amsterdamDate,
  formatClockTime,
  isWithinPaidWindow,
  nextPaidEnd,
  nextPaidStart,
} from "@/lib/parking-schedule";
import { isNlFullyFreeParkingDay } from "@/lib/holidays-nl";
import {
  formatEuro,
  formatZoneLabel,
  hourlyRateEur,
  normalizeZoneId,
  paidScheduleForZone,
  type PaidZoneId,
} from "@/lib/tariffs";

export type LocationKind = "paid" | "permit" | "outside";

export type ParkingSnapshot = {
  kind: LocationKind;
  zone: PaidZoneId | null;
  isPaidNow: boolean;
  hourlyEur: number | null;
  headline: string;
  subline: string;
  nextChangeLabel: string | null;
  /** When street parking is free in a paid zone: when paid rules start again. */
  paidStartsAt: number | null;
  /** When street parking is paid now: when the current paid window ends. */
  paidUntilAt: number | null;
  /** LEFT column: when this parking state changes. */
  changeWhenLabel: string;
  /** CENTER column: which zone or location this applies to. */
  locationLabel: string;
  /** RIGHT column: what applies right now (tariff / GRATIS / VERGUNNING). */
  nowAppliesLabel: string;
};

export type StatusPanelTone = "paid" | "free" | "permit" | "neutral";
export type StatusPanelRightMode = "rate" | "free" | "permit";
export type StatusPanelContext = "live" | "hover" | "selected" | "destination";

export type StatusPanelColumns = {
  left: string;
  center: string;
  right: string;
  rightMode: StatusPanelRightMode;
  fact: string;
  tone: StatusPanelTone;
  rateTappable: boolean;
};

function locationLabel(
  kind: LocationKind,
  zone: PaidZoneId | null,
  zoneRaw: string | null,
): string {
  if (kind === "outside") return "GEEN BETAALZONE";
  if (zone) return zone === "1B" ? "ZONE 1B" : `ZONE ${zone}`;
  if (kind === "permit") {
    const raw = zoneRaw?.trim();
    if (!raw) return "VERGUNNING";
    return raw.length <= 6 ? raw.toUpperCase() : `ZONE ${raw.toUpperCase()}`;
  }
  return "GEEN BETAALZONE";
}

function nowAppliesLabel(
  kind: LocationKind,
  isPaidNow: boolean,
  hourlyEur: number | null,
): string {
  if (kind === "permit") return "VERGUNNING";
  if (isPaidNow && hourlyEur != null) return `€ ${formatEuro(hourlyEur)}/u`;
  return "GRATIS";
}

function panelTone(snapshot: ParkingSnapshot): StatusPanelTone {
  if (snapshot.kind === "permit") return "permit";
  if (snapshot.kind === "outside" || !snapshot.zone) return "neutral";
  if (snapshot.kind === "paid" && snapshot.isPaidNow) return "paid";
  return "free";
}

function naturalStartLabel(target: Date, now: Date): string {
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();
  const time = formatClockTime(target.getHours(), target.getMinutes());
  if (sameDay) return time;
  const tomorrow = addDays(now, 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();
  if (isTomorrow) return `morgen ${time}`;
  const weekday = format(target, "EEEE", { locale: nl }).toLowerCase();
  return `${weekday} ${time}`;
}

export function resolveParkingAtLocation(
  kind: LocationKind,
  zoneRaw: string | null,
  now = new Date(),
): ParkingSnapshot {
  const zonedNow = amsterdamDate(now);

  if (kind === "outside") {
    return {
      kind,
      zone: null,
      isPaidNow: false,
      hourlyEur: null,
      headline: "GEEN BETAALZONE",
      subline: "Volgens gemeentelijke zonekaart",
      nextChangeLabel: null,
      paidStartsAt: null,
      paidUntilAt: null,
      changeWhenLabel: "—",
      locationLabel: locationLabel("outside", null, null),
      nowAppliesLabel: nowAppliesLabel("outside", false, null),
    };
  }

  if (kind === "permit") {
    const zone = normalizeZoneId(zoneRaw);
    return {
      kind,
      zone,
      isPaidNow: false,
      hourlyEur: null,
      headline: "Alleen vergunninghouders",
      subline: zone ? formatZoneLabel(zone) : "Vergunninghouders · 24/7",
      nextChangeLabel: null,
      paidStartsAt: null,
      paidUntilAt: null,
      changeWhenLabel: "24/7",
      locationLabel: locationLabel("permit", zone, zoneRaw),
      nowAppliesLabel: nowAppliesLabel("permit", false, null),
    };
  }

  const zone = normalizeZoneId(zoneRaw);
  if (!zone) {
    return {
      kind: "outside",
      zone: null,
      isPaidNow: false,
      hourlyEur: null,
      headline: "GEEN BETAALZONE",
      subline: "Volgens gemeentelijke zonekaart",
      nextChangeLabel: null,
      paidStartsAt: null,
      paidUntilAt: null,
      changeWhenLabel: "—",
      locationLabel: locationLabel("outside", null, null),
      nowAppliesLabel: nowAppliesLabel("outside", false, null),
    };
  }

  if (isNlFullyFreeParkingDay(zonedNow)) {
    const next = nextPaidStart(zone, zonedNow);
    const fromLabel = naturalStartLabel(next, zonedNow);
    const rate = hourlyRateEur(zone);
    return {
      kind: "paid",
      zone,
      isPaidNow: false,
      hourlyEur: rate,
      headline: "NU GRATIS",
      subline: `${formatZoneLabel(zone)} · betaald parkeren vanaf ${fromLabel}`,
      nextChangeLabel: `Betaald vanaf ${fromLabel}`,
      paidStartsAt: next.getTime(),
      paidUntilAt: null,
      changeWhenLabel: `vanaf ${fromLabel}`,
      locationLabel: locationLabel("paid", zone, zoneRaw),
      nowAppliesLabel: nowAppliesLabel("paid", false, rate),
    };
  }

  const paidNow = isWithinPaidWindow(zone, zonedNow);
  const rate = hourlyRateEur(zone);

  if (paidNow) {
    const end = nextPaidEnd(zone, zonedNow);
    const until = formatClockTime(end.getHours(), end.getMinutes());
    return {
      kind: "paid",
      zone,
      isPaidNow: true,
      hourlyEur: rate,
      headline: `€ ${formatEuro(rate)} / uur`,
      subline: `${formatZoneLabel(zone)} · betaald tot ${until}`,
      nextChangeLabel: `Gratis vanaf ${until}`,
      paidStartsAt: null,
      paidUntilAt: end.getTime(),
      changeWhenLabel: `tot ${until}`,
      locationLabel: locationLabel("paid", zone, zoneRaw),
      nowAppliesLabel: nowAppliesLabel("paid", true, rate),
    };
  }

  const next = nextPaidStart(zone, zonedNow);
  const fromLabel = naturalStartLabel(next, zonedNow);
  return {
    kind: "paid",
    zone,
    isPaidNow: false,
    hourlyEur: rate,
    headline: "NU GRATIS",
    subline: `${formatZoneLabel(zone)} · betaald parkeren vanaf ${fromLabel}`,
    nextChangeLabel: `Betaald vanaf ${fromLabel}`,
    paidStartsAt: next.getTime(),
    paidUntilAt: null,
    changeWhenLabel: `vanaf ${fromLabel}`,
    locationLabel: locationLabel("paid", zone, zoneRaw),
    nowAppliesLabel: nowAppliesLabel("paid", false, rate),
  };
}

/** Live countdown until paid street parking starts (paid zone, currently free). */
export function formatCountdownToPaid(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function formatFreeUntilPaidLabel(paidStartsAt: number, now: Date): string {
  return `Nog ${formatCountdownToPaid(Math.max(0, paidStartsAt - now.getTime()))} gratis`;
}

function panelFact(snapshot: ParkingSnapshot, now: Date): string {
  if (snapshot.kind === "permit") return "Alleen vergunninghouders";
  if (snapshot.kind === "outside" || !snapshot.zone) {
    return "Volgens gemeentelijke zonekaart";
  }
  if (snapshot.isPaidNow) return "Betaald parkeren";
  if (snapshot.paidStartsAt != null) {
    return formatFreeUntilPaidLabel(snapshot.paidStartsAt, now);
  }
  return "Gratis parkeren";
}

/** Stable three-column panel values from a parking snapshot. */
export function statusPanelColumns(
  snapshot: ParkingSnapshot,
  now = new Date(),
): StatusPanelColumns {
  const rightMode: StatusPanelRightMode =
    snapshot.kind === "permit"
      ? "permit"
      : snapshot.isPaidNow
        ? "rate"
        : "free";

  return {
    left: snapshot.changeWhenLabel,
    center: snapshot.locationLabel,
    right: snapshot.nowAppliesLabel,
    rightMode,
    fact: panelFact(snapshot, now),
    tone: panelTone(snapshot),
    rateTappable:
      snapshot.kind === "paid" && snapshot.isPaidNow && snapshot.zone != null,
  };
}

export function composePanelSecondary(input: {
  context: StatusPanelContext;
  fact: string;
  extras?: string[];
}): string {
  const parts: string[] = [];
  if (input.context === "hover") parts.push("Zone onder muis");
  if (input.context === "selected") parts.push("Geselecteerde zone");
  if (input.context === "destination") parts.push("Bestemming");
  parts.push(input.fact);
  for (const extra of input.extras ?? []) {
    if (extra) parts.push(extra);
  }
  return parts.join(" · ");
}

export function zoneSheetDetails(
  kind: LocationKind,
  zoneRaw: string | null,
  now = new Date(),
): {
  title: string;
  lines: string[];
} {
  const snap = resolveParkingAtLocation(kind, zoneRaw, now);
  if (kind === "permit") {
    return {
      title: "Alleen vergunninghouders",
      lines: [
        "Parkeren is hier 24/7 voorbehouden aan vergunninghouders.",
        snap.zone ? formatZoneLabel(snap.zone) : "",
      ].filter(Boolean),
    };
  }
  if (snap.zone) {
    const schedule = paidScheduleForZone(snap.zone);
    return {
      title: formatZoneLabel(snap.zone),
      lines: [
        `Tarief: € ${formatEuro(hourlyRateEur(snap.zone))} per uur`,
        `Ma–za: ${formatClockTime(schedule.weekday.startHour, schedule.weekday.startMinute)}–${formatClockTime(schedule.weekday.endHour, schedule.weekday.endMinute)}`,
        `Zo: ${formatClockTime(schedule.sunday.startHour, schedule.sunday.startMinute)}–${formatClockTime(schedule.sunday.endHour, schedule.sunday.endMinute)}`,
        snap.isPaidNow ? "Nu: betaald parkeren" : "Nu: gratis parkeren",
        snap.nextChangeLabel ?? "",
      ].filter(Boolean),
    };
  }
  return {
    title: "Geen betaalzone",
    lines: ["Volgens de gemeentelijke kaart geldt hier geen betaald straatparkeren."],
  };
}
