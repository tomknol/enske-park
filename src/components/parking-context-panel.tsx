"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { ParkingEstimator } from "@/components/parking-estimator";
import type { DurationRestriction } from "@/lib/duration-restrictions";
import type { LocationKind, ParkingSnapshot, StatusPanelContext } from "@/lib/parking-status";
import {
  composePanelSecondary,
  resolveParkingAtLocation,
  statusPanelColumns,
} from "@/lib/parking-status";
import type { MapPanelContext } from "@/lib/panel-context";
import { PNR_ZUIDERVAL } from "@/lib/pnr-zuiderval";
import { formatEuro } from "@/lib/tariffs";

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
  rightMode?: "rate" | "free" | "permit";
  secondary: string;
  accent?: string | null;
  tone?: PanelTone;
  loading?: boolean;
  rateTappable?: boolean;
};

function extraNotes(
  context: StatusPanelContext,
  nearBoundary: boolean,
  germanHoliday: boolean,
  busyUpgrade: boolean,
): string[] {
  const extras: string[] = [];
  if (context === "live" && nearBoundary) extras.push("Dicht bij zonegrens");
  if (busyUpgrade) extras.push("Extra druk in centrum");
  else if (germanHoliday) extras.push("Duitse feestdag — drukker");
  return extras;
}

function parkingModuleCells(
  snapshot: ParkingSnapshot,
  now: Date | undefined,
  context: StatusPanelContext,
  nearBoundary: boolean,
  germanHoliday: boolean,
  busyUpgrade: boolean,
  durationRestriction: DurationRestriction | null,
): ModuleCells {
  const columns = statusPanelColumns(snapshot, now);
  return {
    left: columns.left,
    center: columns.center,
    right: columns.right,
    rightMode: columns.rightMode,
    secondary: composePanelSecondary({
      context,
      fact: columns.fact,
      extras: extraNotes(context, nearBoundary, germanHoliday, busyUpgrade),
    }),
    accent: durationRestriction?.label ?? null,
    tone: columns.tone,
    rateTappable: columns.rateTappable,
  };
}

function priceCellClass(mode: "rate" | "free" | "permit"): string {
  if (mode === "rate") return "park-module-time tabular-nums";
  if (mode === "free") return "park-module-price park-module-price--free tabular-nums";
  return "park-module-price park-module-price--permit tabular-nums";
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

  if (hoveredZone && mapContext == null) {
    const snap = resolveParkingAtLocation(hoveredZone.kind, hoveredZone.zoneRaw, clock);
    const cells = parkingModuleCells(
      snap,
      clock,
      "hover",
      false,
      germanHoliday,
      busyUpgrade,
      null,
    );
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
    const snap = resolveParkingAtLocation(mapContext.kind, mapContext.zoneRaw, clock);
    const cells = parkingModuleCells(
      snap,
      clock,
      "live",
      false,
      germanHoliday,
      busyUpgrade,
      mapContext.kind === "outside" ? null : durationRestriction,
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
      snap,
      clock,
      "destination",
      false,
      germanHoliday,
      busyUpgrade,
      durationRestriction,
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

  if (mapContext?.type === "zone") {
    const snap = resolveParkingAtLocation(mapContext.kind, mapContext.zoneRaw, clock);
    const cells = parkingModuleCells(
      snap,
      clock,
      "selected",
      false,
      germanHoliday,
      busyUpgrade,
      durationRestriction,
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

  if (geoPending || zonesLoading) {
    return (
      <StatusModule
        left="…"
        center="—"
        right="…"
        secondary="Locatie bepalen…"
        tone="loading"
        loading
      />
    );
  }

  const cells = parkingModuleCells(
    snapshot,
    clock,
    "live",
    nearBoundary,
    germanHoliday,
    busyUpgrade,
    durationRestriction,
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
