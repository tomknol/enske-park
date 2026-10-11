"use client";

import {
  defaultEstimateUntil,
  estimateParkingCost,
  estimateUntilClock,
} from "@/lib/parking-cost-estimator";
import type { PaidZoneId } from "@/lib/tariffs";

type ParkingEstimatorProps = {
  zone: PaidZoneId;
  lon: number | null;
  lat: number | null;
  clock: Date;
  onClose: () => void;
};

const QUICK = [
  { id: "1h", label: "+1 u", hours: 1 },
  { id: "2h", label: "+2 u", hours: 2 },
  { id: "3h", label: "+3 u", hours: 3 },
] as const;

export function ParkingEstimator({ zone, lon, lat, clock, onClose }: ParkingEstimatorProps) {
  const presets = [
    ...QUICK.map((q) => ({
      id: q.id,
      label: q.label,
      until: defaultEstimateUntil(clock, q.hours),
    })),
    { id: "18", label: "18:00", until: estimateUntilClock(clock, 18, 0) },
  ];

  return (
    <div className="park-estimator">
      <div className="park-estimator-head">
        <span className="park-estimator-title">Geschat tot</span>
        <button type="button" className="park-estimator-close" onClick={onClose}>
          Sluiten
        </button>
      </div>
      <div className="park-estimator-chips">
        {presets.map((p) => {
          const result = estimateParkingCost({
            zone,
            from: clock,
            until: p.until,
            lon,
            lat,
          });
          return (
            <div key={p.id} className="park-estimator-chip">
              <span className="park-estimator-chip-label">{p.label}</span>
              <span className="park-estimator-chip-value tabular-nums">{result.label}</span>
              {result.durationWarning && (
                <span className="park-estimator-chip-warn">{result.durationWarning}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
