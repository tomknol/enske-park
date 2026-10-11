"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { ParkingEstimator } from "@/components/parking-estimator";
import type { DurationRestriction } from "@/lib/duration-restrictions";
import type { LocationKind, ParkingSnapshot } from "@/lib/parking-status";
import {
  formatCountdownToPaid,
  resolveParkingAtLocation,
} from "@/lib/parking-status";
import type { MapPanelContext } from "@/lib/panel-context";
import { PNR_ZUIDERVAL } from "@/lib/pnr-zuiderval";
import { formatEuro, paidScheduleForZone, type PaidZoneId } from "@/lib/tariffs";

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
  mapContext: MapPanelContext | null;
  hoveredZone: { kind: "paid" | "permit"; zoneRaw: string | null } | null;
  durationRestriction: DurationRestriction | null;
  estimatorOpen: boolean;
  onEstimatorOpenChange: (open: boolean) => void;
  onClearContext: () => void;
  clock?: Date;
  panelLon: number | null;
  panelLat: number | null;
};

type PanelTone = "paid" | "free" | "permit" | "neutral" | "loading";

type ModuleCells = {
  left: string;
  center: string;
  right: string;
  rightMode?: "rate" | "countdown" | "free" | "permit";
  secondary: string;
  accent?: string | null;
  tone?: PanelTone;
  loading?: boolean;
  rateTappable?: boolean;
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

function priceCellClass(mode: "rate" | "countdown" | "free" | "permit"): string {
  if (mode === "countdown" || mode === "rate") {
    return "park-module-time tabular-nums";
  }
  if (mode === "free") return "park-module-price park-module-price--free tabular-nums";
  return "park-module-price park-module-price--permit tabular-nums";
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
  now?: Date,
): { text: string; mode: "rate" | "countdown" | "free" | "permit" } {
  if (kind === "outside" || (!snapshot.zone && kind !== "permit")) {
    return { text: "GRATIS", mode: "free" };
  }
  if (kind === "permit") return { text: "VERGUNNING", mode: "permit" };
  if (!snapshot.isPaidNow) {
    if (snapshot.paidStartsAt != null && now) {
      const ms = Math.max(0, snapshot.paidStartsAt - now.getTime());
      return { text: formatCountdownToPaid(ms), mode: "countdown" };
    }
    return { text: "GRATIS", mode: "free" };
  }
  if (snapshot.hourlyEur != null) {
    return { text: `€ ${formatEuro(snapshot.hourlyEur)}/u`, mode: "rate" };
  }
  return { text: "—", mode: "rate" };
}

function timeLeft(kind: LocationKind | "outside", snapshot: ParkingSnapshot): string {
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
  prefix?: string,
): string {
  if (geoPending || zonesLoading) return "Locatie bepalen…";
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
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
  durationRestriction: DurationRestriction | null,
  now?: Date,
  prefix?: string,
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
  const { text: right, mode: rightMode } = priceRight(kind, snapshot, now);
  const secondary = liveSecondary(
    snapshot,
    kind,
    nearBoundary,
    geoPending,
    zonesLoading,
    germanHoliday,
    busyUpgrade,
    prefix,
  );
  return {
    left: timeLeft(kind, snapshot),
    center: zoneCenterLabel(kind, snapshot.zone, zoneRaw),
    right,
    rightMode,
    secondary:
      rightMode === "countdown"
        ? "Nog even gratis · daarna betaald parkeren"
        : secondary,
    accent: durationRestriction?.label ?? null,
    tone: panelToneFromParking(kind, snapshot, false),
    rateTappable: kind === "paid" && snapshot.isPaidNow && snapshot.zone != null,
  };
}

function StatusModule({
  left,
  center,
  right,
  rightMode = "rate",
  secondary,
  accent,
  tone = "neutral",
  loading = false,
  rateTappable = false,
  onClear,
  onRateClick,
  children,
}: ModuleCells & {
  onClear?: () => void;
  onRateClick?: () => void;
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
          {rateTappable && onRateClick ? (
            <button type="button" className={priceCellClass(rightMode)} onClick={onRateClick}>
              {right}
            </button>
          ) : (
            <span className={priceCellClass(rightMode)}>{right}</span>
          )}
        </div>
      </div>
      {accent && <p className="park-module-accent">{accent}</p>}
      <p className="park-module-secondary">{secondary}</p>
      {children}
    </div>
  );
}

export function ParkingContextPanel(props: ParkingContextPanelProps) {
  const {
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
    mapContext,
    hoveredZone,
    durationRestriction,
    estimatorOpen,
    onEstimatorOpenChange,
    onClearContext,
    clock,
    panelLon,
    panelLat,
  } = props;

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

  if (hoveredZone && mapContext == null) {
    const kind = hoveredZone.kind === "permit" ? "permit" : "paid";
    const snap = resolveParkingAtLocation(hoveredZone.kind, hoveredZone.zoneRaw, clock);
    const cells = parkingModuleCells(
      kind,
      snap,
      hoveredZone.zoneRaw,
      false,
      false,
      false,
      germanHoliday,
      busyUpgrade,
      null,
      clock,
    );
    if (cells.rightMode !== "countdown") {
      cells.secondary =
        snap.isPaidNow && kind === "paid"
          ? "Zone onder de muis · betaald parkeren"
          : kind === "permit"
            ? "Zone onder de muis · vergunning"
            : "Zone onder de muis · gratis parkeren";
    }
    cells.tone = panelToneFromParking(kind, snap, false);
    return <StatusModule {...cells} />;
  }

  if (mapContext?.type === "info") {
    return (
      <div className="park-panel pointer-events-auto" data-tone="neutral">
        <PanelClose onClear={onClearContext} />
        <p className="park-info-title">ENSKE PARK</p>
        <p className="park-info-body">
          Parkeertarieven en zones voor Enschede. Borden ter plaatse zijn leidend.
        </p>
      </div>
    );
  }

  if (mapContext?.type === "garage") {
    const g = mapContext.garage;
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
        ? `${g.capacity?.toLocaleString("nl-NL") ?? "—"} plaatsen · bijgewerkt ${left}`
        : "Garage · bezetting onbekend";

    return (
      <StatusModule
        left={left}
        center={center}
        right={right}
        secondary={secondary}
        onClear={onClearContext}
      />
    );
  }

  if (mapContext?.type === "pnr") {
    return (
      <StatusModule
        left="24/7"
        center="P+R ZUIDERVAL"
        right={`€ ${formatEuro(PNR_ZUIDERVAL.dailyEur)}/d`}
        secondary={PNR_ZUIDERVAL.transitNote}
        onClear={onClearContext}
      >
        <a
          className="park-panel-action mt-2 inline-block"
          href={PNR_ZUIDERVAL.routeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Route
        </a>
      </StatusModule>
    );
  }

  if (mapContext?.type === "point") {
    if (mapContext.kind === "outside") {
      return (
        <StatusModule
          left="—"
          center="GEEN BETAALZONE"
          right="GRATIS"
          rightMode="free"
          secondary="Buiten gemeentelijke betaalzone"
          tone="neutral"
          onClear={onClearContext}
        />
      );
    }
    const snap = resolveParkingAtLocation(mapContext.kind, mapContext.zoneRaw, clock);
    const cells = parkingModuleCells(
      mapContext.kind,
      snap,
      mapContext.zoneRaw,
      false,
      false,
      false,
      germanHoliday,
      busyUpgrade,
      durationRestriction,
      clock,
    );
    return (
      <StatusModule
        {...cells}
        onClear={onClearContext}
        onRateClick={
          cells.rateTappable ? () => onEstimatorOpenChange(true) : undefined
        }
      >
        {estimatorOpen && snap.zone && clock && (
          <ParkingEstimator
            zone={snap.zone}
            lon={panelLon}
            lat={panelLat}
            clock={clock}
            onClose={() => onEstimatorOpenChange(false)}
          />
        )}
      </StatusModule>
    );
  }

  if (mapContext?.type === "destination") {
    const d = mapContext;
    const snap = resolveParkingAtLocation(d.kind, d.zoneRaw, clock);
    const cells = parkingModuleCells(
      d.kind,
      snap,
      d.zoneRaw,
      false,
      false,
      false,
      germanHoliday,
      busyUpgrade,
      durationRestriction,
      clock,
      "Bestemming",
    );
    return (
      <StatusModule {...cells} onClear={onClearContext} accent={cells.accent}>
        {estimatorOpen && snap.zone && clock && (
          <ParkingEstimator
            zone={snap.zone}
            lon={panelLon}
            lat={panelLat}
            clock={clock}
            onClose={() => onEstimatorOpenChange(false)}
          />
        )}
      </StatusModule>
    );
  }

  if (mapContext?.type === "zone") {
    const snap = resolveParkingAtLocation(mapContext.kind, mapContext.zoneRaw, clock);
    const kind = mapContext.kind === "permit" ? "permit" : "paid";
    const cells = parkingModuleCells(
      kind,
      snap,
      mapContext.zoneRaw,
      false,
      false,
      false,
      germanHoliday,
      busyUpgrade,
      durationRestriction,
      clock,
    );
    if (cells.rightMode !== "countdown") {
      cells.secondary =
        snap.isPaidNow && kind === "paid"
          ? "Geselecteerde zone · betaald parkeren"
          : kind === "permit"
            ? "Geselecteerde zone · vergunning"
            : "Geselecteerde zone · gratis parkeren";
    }
    cells.tone = panelToneFromParking(kind, snap, false);
    return (
      <StatusModule
        {...cells}
        onClear={onClearContext}
        onRateClick={
          cells.rateTappable ? () => onEstimatorOpenChange(true) : undefined
        }
      >
        {estimatorOpen && snap.zone && clock && (
          <ParkingEstimator
            zone={snap.zone}
            lon={panelLon}
            lat={panelLat}
            clock={clock}
            onClose={() => onEstimatorOpenChange(false)}
          />
        )}
      </StatusModule>
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
    durationRestriction,
    clock,
  );

  return (
    <StatusModule
      {...cells}
      onRateClick={cells.rateTappable ? () => onEstimatorOpenChange(true) : undefined}
    >
      {estimatorOpen && snapshot.zone && clock && (
        <ParkingEstimator
          zone={snapshot.zone}
          lon={panelLon}
          lat={panelLat}
          clock={clock}
          onClose={() => onEstimatorOpenChange(false)}
        />
      )}
    </StatusModule>
  );
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
