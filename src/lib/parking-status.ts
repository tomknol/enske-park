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
  /** When street parking is free in a paid zone: when paid rules start again (UTC ms). */
  paidStartsAt: number | null;
};

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
      subline: "Geen betaald parkeren volgens de gemeentelijke kaart",
      nextChangeLabel: null,
      paidStartsAt: null,
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
      subline: "Geen betaald parkeren volgens de gemeentelijke kaart",
      nextChangeLabel: null,
      paidStartsAt: null,
    };
  }

  if (isNlFullyFreeParkingDay(zonedNow)) {
    const next = nextPaidStart(zone, zonedNow);
    return {
      kind: "paid",
      zone,
      isPaidNow: false,
      hourlyEur: hourlyRateEur(zone),
      headline: "NU GRATIS",
      subline: `${formatZoneLabel(zone)} · betaald parkeren vanaf ${naturalStartLabel(next, zonedNow)}`,
      nextChangeLabel: null,
      paidStartsAt: next.getTime(),
    };
  }

  const paidNow = isWithinPaidWindow(zone, zonedNow);
  const rate = hourlyRateEur(zone);

  if (paidNow) {
    const end = nextPaidEnd(zone, zonedNow);
    return {
      kind: "paid",
      zone,
      isPaidNow: true,
      hourlyEur: rate,
      headline: `€ ${formatEuro(rate)} / uur`,
      subline: `${formatZoneLabel(zone)} · betaald tot ${formatClockTime(end.getHours(), end.getMinutes())}`,
      nextChangeLabel: `Gratis vanaf ${formatClockTime(end.getHours(), end.getMinutes())}`,
      paidStartsAt: null,
    };
  }

  const next = nextPaidStart(zone, zonedNow);
  return {
    kind: "paid",
    zone,
    isPaidNow: false,
    hourlyEur: rate,
    headline: "NU GRATIS",
    subline: `${formatZoneLabel(zone)} · betaald parkeren vanaf ${naturalStartLabel(next, zonedNow)}`,
    nextChangeLabel: `Betaald vanaf ${naturalStartLabel(next, zonedNow)}`,
    paidStartsAt: next.getTime(),
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
