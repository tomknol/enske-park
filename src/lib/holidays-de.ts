import { addDays, getYear, isSameDay } from "date-fns";
import { easterSunday } from "@/lib/holidays-nl";

export type GermanState = "NRW" | "Niedersachsen";

type GermanHolidayEntry = {
  name: string;
  date: Date;
  states: GermanState[];
};

function fixed(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

export function germanPublicHolidays(year: number): GermanHolidayEntry[] {
  const easter = easterSunday(year);
  return [
    { name: "Karfreitag", date: addDays(easter, -2), states: ["NRW", "Niedersachsen"] },
    { name: "Ostermontag", date: addDays(easter, 1), states: ["NRW", "Niedersachsen"] },
    { name: "Tag der Arbeit", date: fixed(year, 5, 1), states: ["NRW", "Niedersachsen"] },
    { name: "Christi Himmelfahrt", date: addDays(easter, 39), states: ["NRW", "Niedersachsen"] },
    { name: "Pfingstmontag", date: addDays(easter, 50), states: ["NRW", "Niedersachsen"] },
    { name: "Fronleichnam", date: addDays(easter, 60), states: ["NRW"] },
    { name: "Tag der Deutschen Einheit", date: fixed(year, 10, 3), states: ["NRW", "Niedersachsen"] },
    { name: "Reformationstag", date: fixed(year, 10, 31), states: ["Niedersachsen"] },
    { name: "Allerheiligen", date: fixed(year, 11, 1), states: ["NRW"] },
    { name: "1. Weihnachtstag", date: fixed(year, 12, 25), states: ["NRW", "Niedersachsen"] },
    { name: "2. Weihnachtstag", date: fixed(year, 12, 26), states: ["NRW", "Niedersachsen"] },
  ];
}

export function isRelevantGermanHoliday(date: Date): boolean {
  return germanPublicHolidays(getYear(date)).some((h) => isSameDay(h.date, date));
}
