"use client";

import { useEffect, useRef, useState } from "react";
import type { UserZoneMatch } from "@/lib/zones";

const BOUNDARY_SAMPLES_REQUIRED = 2;

function zoneKey(match: UserZoneMatch): string {
  return `${match.kind}:${match.zoneRaw ?? ""}`;
}

/** Reduces GPS jitter flipping zones at boundaries. */
export function useStableUserZone(raw: UserZoneMatch): UserZoneMatch {
  const [stable, setStable] = useState(raw);
  const pendingRef = useRef<{ key: string; count: number } | null>(null);

  useEffect(() => {
    setStable((prev) => {
      const same = zoneKey(prev) === zoneKey(raw);

      if (same) {
        pendingRef.current = null;
        return {
          ...prev,
          nearBoundary: raw.nearBoundary,
          featureId: raw.featureId,
        };
      }

      const uncertain = raw.nearBoundary || prev.nearBoundary;

      if (!uncertain) {
        pendingRef.current = null;
        return raw;
      }

      const nextKey = zoneKey(raw);
      if (pendingRef.current?.key === nextKey) {
        pendingRef.current.count += 1;
      } else {
        pendingRef.current = { key: nextKey, count: 1 };
      }

      if (pendingRef.current.count >= BOUNDARY_SAMPLES_REQUIRED) {
        pendingRef.current = null;
        return raw;
      }

      return {
        ...prev,
        nearBoundary: true,
      };
    });
  }, [raw]);

  return stable;
}
