import { addDays, getYear, isSameDay, isSunday } from "date-fns";

/** Enschede street parking treatment on Dutch public holidays (Europe/Amsterdam calendar dates). */
export type NlHolidayKind = "full_free" | "sunday_schedule";

export type NlHoliday = {
  date: Date;
  kind: NlHolidayKind;
  id: string;
  label: string;
};

/** Anonymous Gregorian Easter Sunday (Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function koningsdag(year: number): Date {
  const apr27 = new Date(year, 3, 27);
  if (isSunday(apr27)) return new Date(year, 3, 26);
  return apr27;
}

function bevrijdingsdag(year: number): Date {
  return new Date(year, 4, 5);
}

/** All Enschede-relevant Dutch holidays for a calendar year. */
export function nlHolidaysForYear(year: number): NlHoliday[] {
  const easter = easterSunday(year);
  return [
    { id: "nieuwjaar", label: "Nieuwjaarsdag", date: new Date(year, 0, 1), kind: "full_free" },
    { id: "pasen-1", label: "Eerste Paasdag", date: easter, kind: "full_free" },
    {
      id: "goede-vrijdag",
      label: "Goede Vrijdag",
      date: addDays(easter, -2),
      kind: "sunday_schedule",
    },
    {
      id: "pasen-2",
      label: "Tweede Paasdag",
      date: addDays(easter, 1),
      kind: "sunday_schedule",
    },
    {
      id: "koningsdag",
      label: "Koningsdag",
      date: koningsdag(year),
      kind: "sunday_schedule",
    },
    {
      id: "bevrijdingsdag",
      label: "Bevrijdingsdag",
      date: bevrijdingsdag(year),
      kind: "sunday_schedule",
    },
    {
      id: "hemelvaart",
      label: "Hemelvaartsdag",
      date: addDays(easter, 39),
      kind: "sunday_schedule",
    },
    {
      id: "pinksteren-1",
      label: "Eerste Pinksterdag",
      date: addDays(easter, 49),
      kind: "full_free",
    },
    {
      id: "pinksteren-2",
      label: "Tweede Pinksterdag",
      date: addDays(easter, 50),
      kind: "sunday_schedule",
    },
    {
      id: "kerst-1",
      label: "Eerste Kerstdag",
      date: new Date(year, 11, 25),
      kind: "full_free",
    },
    {
      id: "kerst-2",
      label: "Tweede Kerstdag",
      date: new Date(year, 11, 26),
      kind: "sunday_schedule",
    },
  ];
}

export function classifyNlHoliday(date: Date): NlHoliday | null {
  const y = getYear(date);
  for (const h of nlHolidaysForYear(y)) {
    if (isSameDay(h.date, date)) return h;
  }
  return null;
}

/** Entire day free — no paid street parking schedule applies. */
export function isNlFullyFreeParkingDay(date: Date): boolean {
  return classifyNlHoliday(date)?.kind === "full_free";
}

/** Use Sunday paid-window times (ma–za schema does not apply). */
export function usesNlSundayParkingSchedule(date: Date): boolean {
  if (isSunday(date)) return true;
  return classifyNlHoliday(date)?.kind === "sunday_schedule";
}

/** @deprecated Use {@link isNlFullyFreeParkingDay}. */
export function isNlFreeParkingHoliday(date: Date): boolean {
  return isNlFullyFreeParkingDay(date);
}
