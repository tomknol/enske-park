"use client";

import type { ParkingSnapshot } from "@/lib/parking-status";
import { cn } from "@/lib/utils";

type PriceCardProps = {
  snapshot: ParkingSnapshot;
  nearBoundary: boolean;
  zonesLoading: boolean;
  zonesError: boolean;
  geoPending: boolean;
  germanHoliday: boolean;
  busyUpgrade: boolean;
};

export function PriceCard({
  snapshot,
  nearBoundary,
  zonesLoading,
  zonesError,
  geoPending,
  germanHoliday,
  busyUpgrade,
}: PriceCardProps) {
  if (zonesError) {
    return (
      <div className="pointer-events-none w-full max-w-md rounded-2xl bg-white/95 px-5 py-4 shadow-lg ring-1 ring-slate-200 backdrop-blur-sm">
        <p className="text-base font-semibold text-slate-900">Parkeerdata tijdelijk niet beschikbaar</p>
        <p className="mt-1 text-sm text-slate-600">Zonekaart kon niet worden geladen.</p>
      </div>
    );
  }

  const headlineClass = cn(
    "text-[1.65rem] font-bold tracking-tight leading-tight",
    snapshot.headline === "NU GRATIS" && "text-emerald-700",
    snapshot.headline === "GEEN BETAALZONE" && "text-slate-800",
    snapshot.headline === "Alleen vergunninghouders" && "text-blue-800",
    snapshot.isPaidNow && "text-slate-900",
  );

  return (
    <div className="pointer-events-none flex w-full max-w-md flex-col gap-2">
      <div className="rounded-2xl bg-white/95 px-5 py-4 shadow-lg ring-1 ring-slate-200 backdrop-blur-sm">
        {zonesLoading || geoPending ? (
          <div className="animate-pulse space-y-2">
            <div className="h-7 w-40 rounded-md bg-slate-200" />
            <div className="h-4 w-56 rounded-md bg-slate-100" />
            {geoPending && !zonesLoading && (
              <p className="text-sm text-slate-600">Locatie bepalen…</p>
            )}
          </div>
        ) : (
          <>
            <p className={headlineClass}>{snapshot.headline}</p>
            <p className="mt-1 text-sm font-medium text-slate-600">{snapshot.subline}</p>
            {nearBoundary && (
              <p className="mt-2 text-xs font-medium text-amber-800">Dicht bij zonegrens</p>
            )}
          </>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Borden op straat zijn leidend.</p>
      </div>

      {(germanHoliday || busyUpgrade) && (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm shadow-md ring-1 backdrop-blur-sm",
            busyUpgrade
              ? "bg-red-50 text-red-900 ring-red-200"
              : "bg-amber-50 text-amber-950 ring-amber-200",
          )}
          role="status"
        >
          {busyUpgrade ? (
            <>
              <p className="font-semibold">Zeer druk in het centrum</p>
              <p className="mt-0.5">Meerdere garages bijna vol</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Duitse feestdag</p>
              <p className="mt-0.5">Extra drukte in het centrum verwacht</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
