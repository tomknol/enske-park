/**
 * Enschede street parking rules — update this file for new tariff years.
 * Times use Europe/Amsterdam (handled in parking-status.ts).
 */

export type PaidZoneId = "1" | "1B" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export const TARIFF_YEAR = 2026;

export const ZONE_1_HOURLY_EUR = 3.85;
export const ZONE_2_8_HOURLY_EUR = 3.45;

const zone1Schedule = {
  weekday: { startHour: 9, startMinute: 0, endHour: 23, endMinute: 0 },
  sunday: { startHour: 13, startMinute: 0, endHour: 23, endMinute: 0 },
} as const;

const zone2Schedule = {
  weekday: { startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 },
  sunday: { startHour: 13, startMinute: 0, endHour: 19, endMinute: 0 },
} as const;

export function normalizeZoneId(raw: string | null | undefined): PaidZoneId | null {
  if (!raw) return null;
  const z = raw.trim().toUpperCase();
  if (z === "1") return "1";
  if (z === "1B") return "1B";
  const n = Number.parseInt(z, 10);
  if (n >= 2 && n <= 8) return String(n) as PaidZoneId;
  return null;
}

export function isPremiumZone(zone: PaidZoneId): boolean {
  return zone === "1" || zone === "1B";
}

export function hourlyRateEur(zone: PaidZoneId): number {
  return isPremiumZone(zone) ? ZONE_1_HOURLY_EUR : ZONE_2_8_HOURLY_EUR;
}

export function paidScheduleForZone(zone: PaidZoneId) {
  return isPremiumZone(zone) ? zone1Schedule : zone2Schedule;
}

export function formatEuro(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

export function formatZoneLabel(zone: PaidZoneId): string {
  return zone === "1B" ? "Zone 1B" : `Zone ${zone}`;
}
