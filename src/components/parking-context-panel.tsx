"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ParkingEstimator } from "@/components/parking-estimator";
import type { DurationRestriction } from "@/lib/duration-restrictions";
import type { LocationKind, ParkingSnapshot, StatusPanelContext } from "@/lib/parking-status";
import {
  composePanelSecondary,
  formatGeneralPaidHours,
  resolveParkingAtLocation,
  statusPanelColumns,
} from "@/lib/parking-status";
import {
  hoverReplacesContext,
  type HoveredMapFeature,
  type MapPanelContext,
} from "@/lib/panel-context";
import { garagePanelCopy, type GarageMarkerData } from "@/lib/garages";
import {
  getStadserfAccessPoint,
  stadserfAccessDirectionLabel,
  stadserfAccessHoverDirection,
  type StadserfAccessPoint,
} from "@/lib/stadserf-access";
import {
  isStadserfAccessOpen,
  resolveStadserfStatus,
  stadserfAccessHoverFact,
  stadserfAccessWindowCopy,
  stadserfSelectedDetails,
} from "@/lib/stadserf";
import { MOTION, motionMs, prefersReducedMotion } from "@/lib/motion";
import { hoverMotionId, panelMotionKey } from "@/lib/panel-motion";

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
  hoveredZone: HoveredMapFeature | null;
  userInStadserf: boolean;
  durationRestriction: DurationRestriction | null;
  estimatorOpen: boolean;
  onEstimatorOpenChange: (open: boolean) => void;
  onClearContext: () => void;
  clock?: Date;
  panelLon: number | null;
  panelLat: number | null;
};

type PanelTone = "paid" | "free" | "permit" | "neutral" | "loading" | "stadserf";

type PanelEdge = "free" | "premium" | "paid" | "permit" | "stadserf" | "garage" | "neutral";

type ModuleCells = {
  left: string;
  center: string;
  right: string;
  rightMode?: "rate" | "free" | "permit" | "access" | "exemption";
  secondary: string;
  schedule?: string | null;
  accent?: string | null;
  tone?: PanelTone;
  edge?: PanelEdge;
  loading?: boolean;
  rateTappable?: boolean;
};

function edgeForSnapshot(snapshot: ParkingSnapshot): PanelEdge {
  if (snapshot.kind === "permit") return "permit";
  if (snapshot.zone === "1" || snapshot.zone === "1B") return "premium";
  if (snapshot.zone) return "paid";
  return "free";
}

function edgeFromTone(tone: PanelTone): PanelEdge {
  if (tone === "stadserf") return "stadserf";
  if (tone === "permit") return "permit";
  if (tone === "free") return "free";
  if (tone === "paid") return "paid";
  return "neutral";
}

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
    schedule:
      snapshot.kind === "paid" && snapshot.zone
        ? formatGeneralPaidHours(snapshot.zone)
        : null,
    accent: durationRestriction?.label ?? null,
    tone: columns.tone,
    edge: edgeForSnapshot(snapshot),
    rateTappable: columns.rateTappable,
  };
}

function priceCellClass(
  mode: "rate" | "free" | "permit" | "access" | "exemption",
): string {
  if (mode === "rate") return "park-module-price tabular-nums";
  if (mode === "free") return "park-module-price park-module-price--free tabular-nums";
  if (mode === "access") return "park-module-price park-module-price--access tabular-nums";
  if (mode === "exemption") {
    return "park-module-price park-module-price--exemption tabular-nums";
  }
  return "park-module-price park-module-price--permit tabular-nums";
}

function StatusModule({
  left,
  center,
  right,
  rightMode = "rate",
  secondary,
  schedule,
  accent,
  tone = "neutral",
  edge,
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
      data-tone={tone}
      data-edge={edge ?? edgeFromTone(tone)}
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
      {schedule ? <p className="park-module-schedule">{schedule}</p> : null}
      {children}
    </div>
  );
}

function panelSignature(props: ParkingContextPanelProps): string {
  const clock = props.clock ?? new Date();
  const accessOpen = isStadserfAccessOpen(clock);
  if (props.zonesError) {
    return panelMotionKey({
      error: true,
      hover: null,
      context: null,
      paid: null,
      accessOpen: null,
      geo: "ok",
    });
  }

  const hovered = hoverReplacesContext(props.hoveredZone, props.mapContext)
    ? props.hoveredZone
    : null;
  if (hovered) {
    const hover = hovered;
    const zoneHover = hover.kind === "paid" || hover.kind === "permit";
    const snap = zoneHover
      ? resolveParkingAtLocation(hover.kind, hover.zoneRaw, clock)
      : null;
    const timed =
      hover.kind === "stadserf" || hover.kind === "stadserf-access";
    return panelMotionKey({
      error: false,
      hover: hoverMotionId(hover),
      context: null,
      paid: snap ? snap.isPaidNow : null,
      accessOpen: timed ? accessOpen : null,
      geo: "ok",
    });
  }

  const context = props.mapContext;
  if (context?.type === "info") {
    return panelMotionKey({
      error: false,
      hover: null,
      context: "info",
      paid: null,
      accessOpen: null,
      geo: "ok",
    });
  }
  if (context?.type === "garage") {
    return panelMotionKey({
      error: false,
      hover: null,
      context: `garage:${context.garage.id}`,
      paid: null,
      accessOpen: null,
      geo: "ok",
    });
  }
  if (context?.type === "stadserf" || (props.userInStadserf && context == null && !props.geoDenied && !props.geoUnavailableMessage)) {
    return panelMotionKey({
      error: false,
      hover: null,
      context: "stadserf",
      paid: null,
      accessOpen,
      geo: "ok",
    });
  }
  if (context?.type === "stadserf-access") {
    return panelMotionKey({
      error: false,
      hover: null,
      context: `access:${context.id}`,
      paid: null,
      accessOpen,
      geo: "ok",
    });
  }
  if (context?.type === "zone" || context?.type === "point" || context?.type === "destination") {
    const snap = resolveParkingAtLocation(context.kind, context.zoneRaw, clock);
    const id =
      context.type === "zone"
        ? `zone:${context.kind}:${context.zoneRaw ?? ""}`
        : context.type === "destination"
          ? `destination:${context.lon},${context.lat}`
          : `point:${context.lon},${context.lat}`;
    return panelMotionKey({
      error: false,
      hover: null,
      context: id,
      paid: snap.isPaidNow,
      accessOpen: null,
      geo: "ok",
    });
  }

  if (props.geoDenied || props.geoUnavailableMessage) {
    return panelMotionKey({
      error: false,
      hover: null,
      context: null,
      paid: null,
      accessOpen: null,
      geo: props.geoDenied ? "denied" : "unavailable",
    });
  }
  if (props.geoPending || props.zonesLoading) {
    return panelMotionKey({
      error: false,
      hover: null,
      context: null,
      paid: null,
      accessOpen: null,
      geo: "pending",
    });
  }

  return panelMotionKey({
    error: false,
    hover: null,
    context: `live:${props.snapshot.zone ?? props.locationKind}`,
    paid: props.snapshot.isPaidNow,
    accessOpen: null,
    geo: "ok",
  });
}

function PanelCrossfade({
  signature,
  children,
}: {
  signature: string;
  children: ReactNode;
}) {
  const liveRef = useRef(children);
  const [active, setActive] = useState(signature);
  const [outgoing, setOutgoing] = useState<{ key: string; node: ReactNode } | null>(
    null,
  );
  const fadeId = useRef(0);

  useLayoutEffect(() => {
    if (active === signature) return;
    const reduced = prefersReducedMotion();
    setOutgoing(
      reduced ? null : { key: `${active}:${fadeId.current++}`, node: liveRef.current },
    );
    setActive(signature);
  }, [active, signature]);

  useEffect(() => {
    liveRef.current = children;
  }, [children]);

  useEffect(() => {
    if (!outgoing) return;
    const timer = window.setTimeout(() => setOutgoing(null), motionMs(MOTION.panelIn));
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  return (
    <div className="park-panel-content">
      {outgoing ? (
        <div className="park-panel-layer is-out" key={outgoing.key}>
          {outgoing.node}
        </div>
      ) : null}
      <div className={outgoing ? "park-panel-layer is-in" : "park-panel-layer"}>
        {children}
      </div>
    </div>
  );
}

function PanelExpand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={open ? "park-expand is-open" : "park-expand"} inert={open ? undefined : true}>
      <div className="park-expand-clip">{children}</div>
    </div>
  );
}

export function ParkingContextPanel(props: ParkingContextPanelProps) {
  return (
    <div className="park-panel pointer-events-auto">
      <PanelCrossfade signature={panelSignature(props)}>
        <PanelContents {...props} />
      </PanelCrossfade>
    </div>
  );
}

function PanelContents(props: ParkingContextPanelProps) {
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
    userInStadserf,
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

  if (hoverReplacesContext(hoveredZone, mapContext)) {
    if (hoveredZone.kind === "garage") {
      return <GarageHoverModule garage={hoveredZone.garage} />;
    }
    if (hoveredZone.kind === "stadserf-access") {
      const access = getStadserfAccessPoint(hoveredZone.id);
      if (access) return <AccessHoverModule access={access} clock={clock} />;
      return <StadserfModule clock={clock} />;
    }
    if (hoveredZone.kind === "stadserf") {
      return <StadserfModule clock={clock} />;
    }
    if (hoveredZone.kind === "outside") {
      const snap = resolveParkingAtLocation("outside", null, clock);
      const cells = parkingModuleCells(snap, clock, "hover", false, germanHoliday, busyUpgrade, null);
      return <StatusModule {...cells} />;
    }
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
      <div data-tone="neutral">
        <PanelClose onClear={onClearContext} />
        <p className="park-info-title">ENSKE PARK</p>
        <p className="park-info-body">
          Parkeerzones en tarieven voor Enschede. Zie waar de zones zitten.
          Borden ter plaatse zijn leidend.
          Live garagebezetting komt van RDW / Nationaal Parkeerregister en verschijnt
          alleen als de telling recent is.
        </p>
      </div>
    );
  }

  if (mapContext?.type === "garage") {
    return (
      <StatusModule
        {...garagePanelCopy(mapContext.garage)}
        edge="garage"
        onClear={onClearContext}
      />
    );
  }

  if (mapContext?.type === "point") {
    const snap = resolveParkingAtLocation(mapContext.kind, mapContext.zoneRaw, clock);
    const cells = parkingModuleCells(
      snap,
      clock,
      "point",
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
        {snap.zone && clock ? (
          <PanelExpand open={estimatorOpen}>
            <ParkingEstimator
              zone={snap.zone}
              lon={panelLon}
              lat={panelLat}
              clock={clock}
              onClose={() => onEstimatorOpenChange(false)}
            />
          </PanelExpand>
        ) : null}
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
        {snap.zone && clock ? (
          <PanelExpand open={estimatorOpen}>
            <ParkingEstimator
              zone={snap.zone}
              lon={panelLon}
              lat={panelLat}
              clock={clock}
              onClose={() => onEstimatorOpenChange(false)}
            />
          </PanelExpand>
        ) : null}
      </StatusModule>
    );
  }

  if (mapContext?.type === "stadserf") {
    return (
      <StadserfModule clock={clock} onClear={onClearContext} showDetails />
    );
  }

  if (mapContext?.type === "stadserf-access") {
    const access = getStadserfAccessPoint(mapContext.id);
    if (!access) {
      return (
        <StadserfModule clock={clock} onClear={onClearContext} showDetails />
      );
    }
    return (
      <StadserfAccessModule
        name={access.name}
        direction={access.direction}
        clock={clock}
        onClear={onClearContext}
      />
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
        {snap.zone && clock ? (
          <PanelExpand open={estimatorOpen}>
            <ParkingEstimator
              zone={snap.zone}
              lon={panelLon}
              lat={panelLat}
              clock={clock}
              onClose={() => onEstimatorOpenChange(false)}
            />
          </PanelExpand>
        ) : null}
      </StatusModule>
    );
  }

  if (userInStadserf && !geoDenied && !geoUnavailableMessage) {
    return <StadserfModule clock={clock} />;
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
      {snapshot.zone && clock ? (
        <PanelExpand open={estimatorOpen}>
          <ParkingEstimator
            zone={snapshot.zone}
            lon={panelLon}
            lat={panelLat}
            clock={clock}
            onClose={() => onEstimatorOpenChange(false)}
          />
        </PanelExpand>
      ) : null}
    </StatusModule>
  );
}

function GarageHoverModule({ garage }: { garage: GarageMarkerData }) {
  return (
    <StatusModule
      {...garagePanelCopy(garage)}
      tone="neutral"
      edge="garage"
    />
  );
}

function AccessHoverModule({
  access,
  clock,
}: {
  access: StadserfAccessPoint;
  clock?: Date;
}) {
  return (
    <StatusModule
      left="TOEGANG"
      center={access.name.toUpperCase()}
      right={stadserfAccessHoverDirection(access.direction)}
      rightMode="access"
      secondary={stadserfAccessHoverFact(clock ?? new Date())}
      tone="stadserf"
    />
  );
}

function StadserfAccessModule({
  name,
  direction,
  clock,
  onClear,
}: {
  name: string;
  direction: "entry" | "exit" | "both";
  clock?: Date;
  onClear: () => void;
}) {
  const windowCopy = stadserfAccessWindowCopy(clock ?? new Date());
  return (
    <div data-tone="stadserf" data-edge="stadserf">
      <PanelClose onClear={onClear} />
      <div className="park-stadserf-access">
        <p className="park-stadserf-access-kicker">TOEGANG STADSERF</p>
        <p className="park-stadserf-access-name">{name}</p>
        <p className="park-stadserf-access-dir">
          {stadserfAccessDirectionLabel(direction)}
        </p>
        <div className="park-stadserf-access-status">
          <p className="park-stadserf-access-status-title">{windowCopy.title}</p>
          <p className="park-stadserf-access-status-detail">{windowCopy.detail}</p>
        </div>
      </div>
    </div>
  );
}

function StadserfModule({
  clock,
  onClear,
  showDetails = false,
}: {
  clock?: Date;
  onClear?: () => void;
  showDetails?: boolean;
}) {
  const status = resolveStadserfStatus(clock ?? new Date());
  const details = showDetails ? stadserfSelectedDetails() : null;
  return (
    <StatusModule
      left={status.left}
      center={status.center}
      right={status.right}
      rightMode={status.rightMode}
      secondary={status.fact}
      tone={status.tone}
      onClear={onClear}
    >
      {details && (
        <div className="park-stadserf-details">
          <p className="park-stadserf-title">{details.title}</p>
          <ul className="park-stadserf-list">
            {details.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <a
            className="park-stadserf-link"
            href={details.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {details.actionLabel}
          </a>
        </div>
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
