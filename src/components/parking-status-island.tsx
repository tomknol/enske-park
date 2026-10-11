"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { LocationKind, ParkingSnapshot } from "@/lib/parking-status";
import { zoneSheetDetails } from "@/lib/parking-status";
import {
  formatEuro,
  formatZoneLabel,
  hourlyRateEur,
  paidScheduleForZone,
  type PaidZoneId,
} from "@/lib/tariffs";
import { cn } from "@/lib/utils";
import { zoneBadgeTokens } from "@/lib/zones";

type ParkingStatusIslandProps = {
  snapshot: ParkingSnapshot;
  locationKind: LocationKind | "outside";
  zoneRaw: string | null;
  nearBoundary: boolean;
  zonesLoading: boolean;
  zonesError: boolean;
  geoPending: boolean;
  germanHoliday: boolean;
  busyUpgrade: boolean;
  onInfo: () => void;
  clock?: Date;
};

function zoneCode(
  kind: LocationKind | "outside",
  zone: ParkingSnapshot["zone"],
  zoneRaw: string | null,
): string | null {
  if (kind === "permit") {
    const raw = zoneRaw?.trim();
    return raw ? raw.toUpperCase() : "Vg";
  }
  if (kind === "outside" || !zone) return null;
  return zone;
}

function formatSlot(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function scheduleLines(zone: PaidZoneId): string[] {
  const s = paidScheduleForZone(zone);
  return [
    `Ma–za ${formatSlot(s.weekday.startHour, s.weekday.startMinute)}–${formatSlot(s.weekday.endHour, s.weekday.endMinute)}`,
    `Zo ${formatSlot(s.sunday.startHour, s.sunday.startMinute)}–${formatSlot(s.sunday.endHour, s.sunday.endMinute)}`,
  ];
}

export function ParkingStatusIsland({
  snapshot,
  locationKind,
  zoneRaw,
  nearBoundary,
  zonesLoading,
  zonesError,
  geoPending,
  germanHoliday,
  busyUpgrade,
  onInfo,
  clock,
}: ParkingStatusIslandProps) {
  const [expanded, setExpanded] = useState(false);
  const code = zoneCode(locationKind, snapshot.zone, zoneRaw);
  const contentKey = `${locationKind}:${code}:${snapshot.isPaidNow}:${snapshot.hourlyEur}`;

  if (zonesError) {
    return (
      <div className="map-island mx-auto w-[calc(100%-24px)] max-w-[420px] px-4 py-3">
        <p className="text-sm font-semibold text-[var(--map-text)]">Parkeerdata niet beschikbaar</p>
      </div>
    );
  }

  const badgeTokens =
    code != null && (locationKind === "paid" || locationKind === "permit")
      ? zoneBadgeTokens(zoneRaw, locationKind === "permit" ? "permit" : "paid")
      : null;

  const secondaryLine = (() => {
    if (geoPending && zonesLoading) return null;
    if (geoPending) return "Locatie bepalen…";
    if (nearBoundary) return "Dicht bij zonegrens";
    if (locationKind === "outside" || (!snapshot.zone && locationKind !== "permit")) {
      return "Volgens gemeentelijke parkeerkaart";
    }
    if (locationKind === "permit") {
      return "Alleen parkeren met vergunning";
    }
    if (snapshot.isPaidNow) {
      const until = snapshot.subline.match(/betaald tot (\d{2}:\d{2})/i);
      if (until) return `Betaald tot ${until[1]}`;
      return snapshot.nextChangeLabel?.replace(/^Gratis vanaf /, "Betaald tot ") ?? snapshot.subline;
    }
    return snapshot.nextChangeLabel ?? snapshot.subline;
  })();

  const primaryMain = (() => {
    if (zonesLoading || geoPending) {
      return (
        <span className="text-lg font-medium text-[var(--map-text-muted)]">Locatie bepalen…</span>
      );
    }
    if (locationKind === "outside" || (!snapshot.zone && locationKind !== "permit")) {
      return (
        <span className="text-lg font-semibold tracking-tight text-[var(--map-text)]">
          Geen betaalzone
        </span>
      );
    }
    if (locationKind === "permit") {
      return (
        <span className="text-lg font-semibold tracking-tight text-[var(--map-text)]">
          Vergunninghouders
        </span>
      );
    }
    if (!snapshot.isPaidNow) {
      return (
        <span className="text-[1.5rem] font-bold tracking-tight text-emerald-300/95">Gratis</span>
      );
    }
    if (snapshot.hourlyEur != null) {
      return (
        <span className="flex items-baseline gap-1 tabular-nums">
          <span className="text-base font-medium text-[var(--map-text-secondary)]">€</span>
          <span className="text-[1.5rem] font-bold leading-none tracking-tight text-[var(--map-text)]">
            {formatEuro(snapshot.hourlyEur)}
          </span>
          <span className="text-sm font-medium text-[var(--map-text-secondary)]">/ uur</span>
        </span>
      );
    }
    return null;
  })();

  const expandedDetails =
    snapshot.zone && locationKind === "paid"
      ? zoneSheetDetails("paid", zoneRaw, clock)
      : locationKind === "permit"
        ? zoneSheetDetails("permit", zoneRaw, clock)
        : null;

  return (
    <div className="pointer-events-auto mx-auto w-[calc(100%-24px)] max-w-[420px]">
      <div
        className={cn("map-island overflow-hidden", expanded && "map-island--expanded")}
      >
        <button
          type="button"
          className="flex w-full flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--map-accent)]/35"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-0 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--map-text-muted)]">
              Enske Park
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-[var(--map-text-muted)] transition-transform duration-200",
                expanded && "rotate-180",
              )}
              strokeWidth={2}
              aria-hidden
            />
          </div>

          <div className="px-4 pb-3 pt-2">
            <div key={contentKey} className="map-island-fade flex flex-wrap items-center gap-2">
              {code != null && !zonesLoading && !geoPending && badgeTokens && (
                <span
                  className="map-zone-badge shrink-0"
                  style={{
                    backgroundColor: badgeTokens.background,
                    borderColor: badgeTokens.border,
                    color: badgeTokens.color,
                  }}
                  aria-hidden
                >
                  {code}
                </span>
              )}
              <div className="min-w-0 flex-1">{primaryMain}</div>
            </div>
            {secondaryLine && (
              <p className="mt-1.5 text-[13px] leading-snug text-[var(--map-text-secondary)]">
                {secondaryLine}
              </p>
            )}
          </div>
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="border-t border-[var(--liquid-border)] px-4 pb-4 pt-3 text-[13px] leading-relaxed text-[var(--map-text-secondary)]">
              {expandedDetails && snapshot.zone && (
                <p className="font-medium text-[var(--map-text)]">
                  {formatZoneLabel(snapshot.zone)}
                  {snapshot.hourlyEur != null &&
                    locationKind === "paid" &&
                    ` · € ${formatEuro(hourlyRateEur(snapshot.zone))} / uur`}
                </p>
              )}
              {expandedDetails && locationKind === "paid" && snapshot.zone && (
                <ul className="mt-2 space-y-0.5">
                  {scheduleLines(snapshot.zone).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                  <li className="pt-1">
                    {snapshot.isPaidNow ? "Nu: betaald parkeren" : "Nu: gratis parkeren"}
                  </li>
                </ul>
              )}
              {locationKind === "permit" && (
                <p className="mt-1">Parkeren is hier voorbehouden aan vergunninghouders.</p>
              )}
              {(germanHoliday || busyUpgrade) && (
                <p className="mt-2 text-amber-200/90">
                  {busyUpgrade
                    ? "Zeer druk in het centrum — meerdere garages bijna vol."
                    : "Duitse feestdag — extra drukte verwacht."}
                </p>
              )}
              <p className="mt-3 text-[12px] text-[var(--map-text-muted)]">
                Borden op straat zijn leidend.
              </p>
              <button
                type="button"
                className="map-text-button mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onInfo();
                }}
              >
                <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
                Over deze app
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
