import { addMinutes, addDays, set } from "date-fns";
import { findDurationRestriction } from "@/lib/duration-restrictions";
import { isNlFullyFreeParkingDay } from "@/lib/holidays-nl";
import {
  amsterdamDate,
  isWithinPaidWindow,
  nextPaidEnd,
  paidWindowEndOnDay,
  paidWindowStartOnDay,
} from "@/lib/parking-schedule";
import { hourlyRateEur, type PaidZoneId } from "@/lib/tariffs";

export type CostEstimateInput = {
  zone: PaidZoneId;
  from?: Date;
  until: Date;
  lon?: number | null;
  lat?: number | null;
};

export type CostEstimateResult = {
  totalEur: number;
  paidMinutes: number;
  label: string;
  durationWarning: string | null;
  isApproximate: boolean;
};

const MS_MIN = 60_000;

function startOfAmsterdamDay(d: Date): Date {
  return set(d, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
}

function addPaidMinutes(
  zone: PaidZoneId,
  from: Date,
  until: Date,
): { paidMinutes: number } {
  let paidMinutes = 0;
  let cursor = from;
  const end = until;

  while (cursor < end) {
    if (isNlFullyFreeParkingDay(cursor)) {
      cursor = addDays(startOfAmsterdamDay(cursor), 1);
      continue;
    }

    const dayStart = startOfAmsterdamDay(cursor);
    const winStart = paidWindowStartOnDay(zone, dayStart);
    const winEnd = paidWindowEndOnDay(zone, dayStart);

    if (cursor < winStart) {
      cursor = winStart;
      continue;
    }

    if (cursor >= winEnd) {
      cursor = addDays(dayStart, 1);
      continue;
    }

    const segmentEnd = end < winEnd ? end : winEnd;
    if (segmentEnd > cursor) {
      paidMinutes += (segmentEnd.getTime() - cursor.getTime()) / MS_MIN;
    }
    cursor = segmentEnd >= winEnd ? addDays(dayStart, 1) : segmentEnd;
  }

  return { paidMinutes };
}

export function estimateParkingCost(input: CostEstimateInput): CostEstimateResult {
  const from = amsterdamDate(input.from ?? new Date());
  const until = amsterdamDate(input.until);
  if (until <= from) {
    return {
      totalEur: 0,
      paidMinutes: 0,
      label: "± € 0,00",
      durationWarning: null,
      isApproximate: true,
    };
  }

  const zone = input.zone;
  const rate = hourlyRateEur(zone);
  const { paidMinutes } = addPaidMinutes(zone, from, until);
  const totalEur = (paidMinutes / 60) * rate;

  let durationWarning: string | null = null;
  if (input.lon != null && input.lat != null) {
    const restriction = findDurationRestriction(input.lon, input.lat);
    if (restriction) {
      const stayMinutes = (until.getTime() - from.getTime()) / MS_MIN;
      if (stayMinutes > restriction.maxMinutes) {
        if (restriction.maxMinutes === 30) {
          durationWarning = "Maximaal 30 minuten toegestaan";
        } else if (restriction.maxMinutes % 60 === 0) {
          const h = restriction.maxMinutes / 60;
          durationWarning =
            h === 1
              ? "Maximaal 1 uur toegestaan"
              : `Maximaal ${h} uur toegestaan`;
        } else {
          durationWarning = `Maximaal ${restriction.maxMinutes} minuten toegestaan`;
        }
      }
    }
  }

  const formatted = totalEur.toFixed(2).replace(".", ",");
  return {
    totalEur,
    paidMinutes,
    label: `± € ${formatted}`,
    durationWarning,
    isApproximate: true,
  };
}

export function defaultEstimateUntil(from: Date, hours: number): Date {
  return addMinutes(amsterdamDate(from), hours * 60);
}

export function estimateUntilClock(from: Date, hour: number, minute = 0): Date {
  const base = amsterdamDate(from);
  let target = set(base, { hours: hour, minutes: minute, seconds: 0, milliseconds: 0 });
  if (target <= base) target = addDays(target, 1);
  return target;
}

/** Whether `until` is still within today's paid window from `from`. */
export function isUntilWithinSamePaidWindow(
  zone: PaidZoneId,
  from: Date,
  until: Date,
): boolean {
  if (!isWithinPaidWindow(zone, from)) return false;
  const end = nextPaidEnd(zone, from);
  return until <= end;
}

export function describeEstimateUntil(until: Date, from: Date): string {
  const sameDay =
    until.getFullYear() === from.getFullYear() &&
    until.getMonth() === from.getMonth() &&
    until.getDate() === from.getDate();
  const hh = String(until.getHours()).padStart(2, "0");
  const mm = String(until.getMinutes()).padStart(2, "0");
  return sameDay ? `Tot ${hh}:${mm}` : `Tot ${hh}:${mm} (andere dag)`;
}
