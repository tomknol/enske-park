import { addDays, set } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  isNlFullyFreeParkingDay,
  usesNlSundayParkingSchedule,
} from "@/lib/holidays-nl";
import { paidScheduleForZone, type PaidZoneId } from "@/lib/tariffs";

const TZ = "Europe/Amsterdam";

export type TimeSlot = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

export function amsterdamDate(input = new Date()): Date {
  return toZonedTime(input, TZ);
}

function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function effectivePaidSlot(zone: PaidZoneId, date: Date): TimeSlot {
  const schedule = paidScheduleForZone(zone);
  return usesNlSundayParkingSchedule(date) ? schedule.sunday : schedule.weekday;
}

export function isWithinPaidWindow(zone: PaidZoneId, at: Date): boolean {
  if (isNlFullyFreeParkingDay(at)) return false;
  const slot = effectivePaidSlot(zone, at);
  const nowMin = minutesOfDay(at.getHours(), at.getMinutes());
  const start = minutesOfDay(slot.startHour, slot.startMinute);
  const end = minutesOfDay(slot.endHour, slot.endMinute);
  return nowMin >= start && nowMin < end;
}

export function paidWindowEndOnDay(zone: PaidZoneId, day: Date): Date {
  const slot = effectivePaidSlot(zone, day);
  return set(day, {
    hours: slot.endHour,
    minutes: slot.endMinute,
    seconds: 0,
    milliseconds: 0,
  });
}

export function paidWindowStartOnDay(zone: PaidZoneId, day: Date): Date {
  const slot = effectivePaidSlot(zone, day);
  return set(day, {
    hours: slot.startHour,
    minutes: slot.startMinute,
    seconds: 0,
    milliseconds: 0,
  });
}

/** Next instant paid parking begins (or `from` if already inside paid window). */
export function nextPaidStart(zone: PaidZoneId, from: Date): Date {
  for (let i = 0; i < 14; i++) {
    const day = addDays(from, i === 0 ? 0 : 1);
    const dayStart = set(day, {
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    if (isNlFullyFreeParkingDay(dayStart)) continue;

    const start = paidWindowStartOnDay(zone, dayStart);
    if (i === 0 && from >= start) {
      const end = paidWindowEndOnDay(zone, dayStart);
      if (from < end) return from;
      continue;
    }
    if (i > 0 || from < start) return start;
  }
  return addDays(from, 1);
}

export function nextPaidEnd(zone: PaidZoneId, from: Date): Date {
  return paidWindowEndOnDay(zone, from);
}

export function formatClockTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
