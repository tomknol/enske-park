"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import type { GarageMarkerData } from "@/components/parking-map";
import type { LocationKind, ParkingSnapshot } from "@/lib/parking-status";
import { resolveParkingAtLocation } from "@/lib/parking-status";
import { formatEuro, paidScheduleForZone, type PaidZoneId } from "@/lib/tariffs";

export type SelectedMapFeature =
  | { type: "zone"; kind: "paid" | "permit"; zoneRaw: string | null }
  | { type: "garage"; garage: GarageMarkerData }
  | { type: "info" };

type ParkingContextPanelProps = {
  snapshot: ParkingSnapshot;
  locationKind: LocationKind | "outside";
  zoneRaw: string | null;
  nearBoundary: boolean;
  zonesLoading: boolean;
  zonesError: boolean;
  geoPending: boolean;
  geoDenied: boolean;
  geoUnavailableMessage: string | null;
  onRetryGeo: () => void;
  germanHoliday: boolean;
  busyUpgrade: boolean;
  selected: SelectedMapFeature | null;
  /** Desktop: zone under cursor — temporary preview in the top module. */
  hoveredZone: { kind: "paid" | "permit"; zoneRaw: string | null } | null;
  onClearSelection: () => void;
  clock?: Date;
};

type PanelTone = "paid" | "free" | "permit" | "neutral" | "loading";

type ModuleCells = {
  left: string;
  center: string;
  right: string;
  secondary: string;
  tone?: PanelTone;
  loading?: boolean;
};

function panelToneFromParking(
  kind: LocationKind | "outside",
  snapshot: ParkingSnapshot,
  loading: boolean,
): PanelTone {
  if (loading) return "loading";
  if (kind === "permit") return "permit";
  if (kind === "outside" || !snapshot.zone) return "neutral";
  if (kind === "paid" && snapshot.isPaidNow) return "paid";
  if (!snapshot.isPaidNow) return "free";
  return "neutral";
}

function priceCellClass(right: string): string {
  const base = "park-module-price tabular-nums";
  if (right === "GRATIS") return `${base} park-module-price--free`;
  if (right === "VERGUNNING") return `${base} park-module-price--permit`;
  return base;
}

function formatClockShort(h: number, m: number): string {
  if (m === 0) return String(h).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayWindow(zone: PaidZoneId): string {
  const s = paidScheduleForZone(zone).weekday;
  return `${formatClockShort(s.startHour, s.startMinute)}–${formatClockShort(s.endHour, s.endMinute)}`;
}

function zoneCenterLabel(
  kind: LocationKind | "outside",
  zone: PaidZoneId | null,
  zoneRaw: string | null,
): string {
  if (kind === "outside" || (!zone && kind !== "permit")) return "GEEN ZONE";
  if (zone) return zone === "1B" ? "ZONE 1B" : `ZONE ${zone}`;
  const raw = zoneRaw?.trim();
  if (raw) return raw.length <= 6 ? raw.toUpperCase() : `ZONE ${raw.toUpperCase()}`;
  return "VERG.";
}

function priceRight(
  kind: LocationKind | "outside",
  snapshot: ParkingSnapshot,
): string {
  if (kind === "outside" || (!snapshot.zone && kind !== "permit")) return "GRATIS";
  if (kind === "permit") return "VERGUNNING";
  if (!snapshot.isPaidNow) return "GRATIS";
  if (snapshot.hourlyEur != null) return `€ ${formatEuro(snapshot.hourlyEur)}/u`;
  return "—";
}

function timeLeft(
  kind: LocationKind | "outside",
  snapshot: ParkingSnapshot,
): string {
  if (kind === "outside") return "—";
  if (kind === "permit") return "24/7";
  if (!snapshot.zone) return "—";
  const zone = snapshot.zone;
  if (snapshot.isPaidNow) {
    const match = snapshot.subline.match(/betaald tot (\d{2}:\d{2})/i);
    if (match) return `tot ${match[1]}`;
    return weekdayWindow(zone);
  }
  const fromNext = snapshot.nextChangeLabel?.replace(/^Betaald vanaf /i, "vanaf ");
  if (fromNext?.startsWith("vanaf ")) return fromNext;
  return weekdayWindow(zone);
}

function liveSecondary(
  snapshot: ParkingSnapshot,
  locationKind: LocationKind | "outside",
  nearBoundary: boolean,
  geoPending: boolean,
  zonesLoading: boolean,
  germanHoliday: boolean,
  busyUpgrade: boolean,
): string {
  if (geoPending || zonesLoading) return "Locatie bepalen…";
  const parts: string[] = [];
  if (nearBoundary) parts.push("Dicht bij zonegrens");
  else if (locationKind === "outside" || (!snapshot.zone && locationKind !== "permit")) {
    parts.push("Geen betaald parkeren volgens de kaart");
  } else if (locationKind === "permit") {
    parts.push("Alleen vergunninghouders");
  } else if (snapshot.isPaidNow) {
    parts.push("Betaald parkeren");
  } else {
    parts.push("Borden op straat zijn leidend");
  }
  if (busyUpgrade) parts.push("Extra druk in centrum");
  else if (germanHoliday) parts.push("Duitse feestdag — drukker");
  return parts.join(" · ");
}

function parkingModuleCells(
  kind: LocationKind | "outside",
  snapshot: ParkingSnapshot,
  zoneRaw: string | null,
  nearBoundary: boolean,
  geoPending: boolean,
  zonesLoading: boolean,
  germanHoliday: boolean,
  busyUpgrade: boolean,
): ModuleCells {
  if (geoPending || zonesLoading) {
    return {
      left: "…",
      center: "—",
      right: "…",
      secondary: "Locatie bepalen…",
      tone: "loading",
      loading: true,
    };
  }
  const right = priceRight(kind, snapshot);
  return {
    left: timeLeft(kind, snapshot),
    center: zoneCenterLabel(kind, snapshot.zone, zoneRaw),
    right,
    secondary: liveSecondary(
      snapshot,
      kind,
      nearBoundary,
      geoPending,
      zonesLoading,
      germanHoliday,
      busyUpgrade,
    ),
    tone: panelToneFromParking(kind, snapshot, false),
  };
}

function StatusModule({
  left,
  center,
  right,
  secondary,
  tone = "neutral",
  loading = false,
  onClear,
  children,
}: ModuleCells & {
  onClear?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="park-panel pointer-events-auto"
      data-tone={tone}
      data-loading={loading ? "true" : undefined}
    >
      {onClear && <PanelClose onClear={onClear} />}
      <div className="park-module-row">
        <div className="park-module-col park-module-col--left">
          <span className="park-module-time tabular-nums">{left}</span>
        </div>
        <div className="park-module-col park-module-col--center">
          <span className="park-module-zone">{center}</span>
        </div>
        <div className="park-module-col park-module-col--right">
          <span className={priceCellClass(right)}>{right}</span>
        </div>
      </div>
      <p className="park-module-secondary">{secondary}</p>
      {children}
    </div>
  );
}

export function ParkingContextPanel({
  snapshot,
  locationKind,
  zoneRaw,
  nearBoundary,
  zonesLoading,
  zonesError,
  geoPending,
  geoDenied,
  geoUnavailableMessage,
  onRetryGeo,
  germanHoliday,
  busyUpgrade,
  selected,
  hoveredZone,
  onClearSelection,
  clock,
}: ParkingContextPanelProps) {
  if (zonesError) {
    return (
      <StatusModule
        left="—"
        center="DATA"
        right="—"
        secondary="Parkeerdata tijdelijk niet beschikbaar"
        tone="neutral"
      />
    );
  }

  if (geoDenied || geoUnavailableMessage) {
    return (
      <StatusModule
        left="—"
        center="LOCATIE"
        right="—"
        secondary={
          geoDenied
            ? "Sta locatie toe voor je parkeerstatus"
            : (geoUnavailableMessage ?? "Locatie niet beschikbaar")
        }
      >
        <button type="button" className="park-panel-action mt-2" onClick={onRetryGeo}>
          Opnieuw proberen
        </button>
      </StatusModule>
    );
  }

  if (hoveredZone) {
    const kind = hoveredZone.kind === "permit" ? "permit" : "paid";
    const snap = resolveParkingAtLocation(hoveredZone.kind, hoveredZone.zoneRaw, clock);
    const cells = parkingModuleCells(
      kind,
      snap,
      hoveredZone.zoneRaw,
      false,
      false,
      false,
      false,
      false,
    );
    cells.secondary =
      snap.isPaidNow && kind === "paid"
        ? "Zone onder de muis · betaald parkeren"
        : kind === "permit"
          ? "Zone onder de muis · vergunning"
          : "Zone onder de muis · gratis parkeren";
    cells.tone = panelToneFromParking(kind, snap, false);
    return <StatusModule {...cells} />;
  }

  if (selected?.type === "info") {
    return (
      <div className="park-panel pointer-events-auto" data-tone="neutral">
        <PanelClose onClear={onClearSelection} />
        <p className="park-info-title">ENSKE PARK</p>
        <p className="park-info-body">
          Parkeertarieven en zones voor Enschede. Borden ter plaatse zijn leidend.
        </p>
      </div>
    );
  }

  if (selected?.type === "zone") {
    const snap = resolveParkingAtLocation(selected.kind, selected.zoneRaw, clock);
    const kind = selected.kind === "permit" ? "permit" : "paid";
    const cells = parkingModuleCells(
      kind,
      snap,
      selected.zoneRaw,
      false,
      false,
      false,
      false,
      false,
    );
    cells.secondary =
      snap.isPaidNow && kind === "paid"
        ? "Geselecteerde zone · betaald parkeren"
        : kind === "permit"
          ? "Geselecteerde zone · vergunning"
          : "Geselecteerde zone · gratis parkeren";
    cells.tone = panelToneFromParking(kind, snap, false);
    return <StatusModule {...cells} onClear={onClearSelection} />;
  }

  if (selected?.type === "garage") {
    const g = selected.garage;
    const left =
      g.lastUpdated && g.live
        ? format(new Date(g.lastUpdated), "HH:mm")
        : g.capacity
          ? `${g.capacity.toLocaleString("nl-NL")} pl.`
          : "—";
    const center = g.shortLabel.toUpperCase();
    const right =
      g.live && g.vacant != null ? `${g.vacant.toLocaleString("nl-NL")} vrij` : "—";
    const secondary =
      g.live && g.vacant != null
        ? "Garage · live bezetting"
        : "Garage · bezetting onbekend";

    return (
      <StatusModule
        left={left}
        center={center}
        right={right}
        secondary={secondary}
        onClear={onClearSelection}
      />
    );
  }

  const cells = parkingModuleCells(
    locationKind,
    snapshot,
    zoneRaw,
    nearBoundary,
    geoPending,
    zonesLoading,
    germanHoliday,
    busyUpgrade,
  );

  return <StatusModule {...cells} />;
}

function PanelClose({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      className="park-panel-close"
      aria-label="Terug naar mijn locatie"
      onClick={onClear}
    >
      <X className="h-4 w-4" strokeWidth={2} aria-hidden />
    </button>
  );
}
