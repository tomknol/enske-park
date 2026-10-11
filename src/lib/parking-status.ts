import { addDays, format, isSunday, set } from "date-fns";
import { nl } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { isNlFreeParkingHoliday } from "@/lib/holidays-nl";
import {
  formatEuro,
  formatZoneLabel,
  hourlyRateEur,
  normalizeZoneId,
  paidScheduleForZone,
  type PaidZoneId,
} from "@/lib/tariffs";

const TZ = "Europe/Amsterdam";

export type LocationKind = "paid" | "permit" | "outside";

export type ParkingSnapshot = {
  kind: LocationKind;
  zone: PaidZoneId | null;
  isPaidNow: boolean;
  hourlyEur: number | null;
  headline: string;
  subline: string;
  nextChangeLabel: string | null;
};

function nowInAmsterdam(now = new Date()): Date {
  return toZonedTime(now, TZ);
}

function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function isWithinPaidWindow(zone: PaidZoneId, date: Date): boolean {
  const schedule = paidScheduleForZone(zone);
  const slot = isSunday(date) ? schedule.sunday : schedule.weekday;
  const nowMin = minutesOfDay(date.getHours(), date.getMinutes());
  const start = minutesOfDay(slot.startHour, slot.startMinute);
  const end = minutesOfDay(slot.endHour, slot.endMinute);
  return nowMin >= start && nowMin < end;
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function nextPaidStart(zone: PaidZoneId, from: Date): Date {
  const schedule = paidScheduleForZone(zone);
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i === 0 ? 0 : 1);
    const zoned = set(day, {
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    if (isNlFreeParkingHoliday(zoned)) continue;
    const slot = isSunday(zoned) ? schedule.sunday : schedule.weekday;
    const start = set(zoned, {
      hours: slot.startHour,
      minutes: slot.startMinute,
      seconds: 0,
      milliseconds: 0,
    });
    if (i === 0 && from >= start) {
      const end = set(zoned, {
        hours: slot.endHour,
        minutes: slot.endMinute,
        seconds: 0,
        milliseconds: 0,
      });
      if (from < end) return from;
      continue;
    }
    if (i > 0 || from < start) return start;
  }
  return addDays(from, 1);
}

function nextPaidEnd(zone: PaidZoneId, from: Date): Date {
  const schedule = paidScheduleForZone(zone);
  const slot = isSunday(from) ? schedule.sunday : schedule.weekday;
  return set(from, {
    hours: slot.endHour,
    minutes: slot.endMinute,
    seconds: 0,
    milliseconds: 0,
  });
}

function naturalStartLabel(target: Date, now: Date): string {
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();
  const time = formatTime(target.getHours(), target.getMinutes());
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
  const zonedNow = nowInAmsterdam(now);

  if (kind === "outside") {
    return {
      kind,
      zone: null,
      isPaidNow: false,
      hourlyEur: null,
      headline: "GEEN BETAALZONE",
      subline: "Geen betaald parkeren volgens de gemeentelijke kaart",
      nextChangeLabel: null,
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
    };
  }

  if (isNlFreeParkingHoliday(zonedNow)) {
    const next = nextPaidStart(zone, zonedNow);
    return {
      kind: "paid",
      zone,
      isPaidNow: false,
      hourlyEur: hourlyRateEur(zone),
      headline: "NU GRATIS",
      subline: `${formatZoneLabel(zone)} · betaald parkeren vanaf ${naturalStartLabel(next, zonedNow)}`,
      nextChangeLabel: null,
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
      subline: `${formatZoneLabel(zone)} · betaald tot ${formatTime(end.getHours(), end.getMinutes())}`,
      nextChangeLabel: `Gratis vanaf ${formatTime(end.getHours(), end.getMinutes())}`,
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
  };
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
        `Ma–za: ${formatTime(schedule.weekday.startHour, schedule.weekday.startMinute)}–${formatTime(schedule.weekday.endHour, schedule.weekday.endMinute)}`,
        `Zo: ${formatTime(schedule.sunday.startHour, schedule.sunday.startMinute)}–${formatTime(schedule.sunday.endHour, schedule.sunday.endMinute)}`,
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
