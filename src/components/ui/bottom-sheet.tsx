"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
      repositionInputs={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="map-sheet-overlay fixed inset-0 z-[90]" />
        <Drawer.Content
          className={cn(
            "map-sheet fixed inset-x-0 bottom-0 z-[100] flex max-h-[88dvh] flex-col outline-none",
            className,
          )}
          style={{
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          }}
        >
          <Drawer.Handle className="map-sheet-handle mx-auto mt-3 shrink-0" />
          <Drawer.Title className="shrink-0 px-4 pt-3 text-base font-semibold tracking-tight text-[var(--map-text)]">
            {title}
          </Drawer.Title>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2 text-[15px] leading-relaxed text-[var(--map-text-secondary)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
