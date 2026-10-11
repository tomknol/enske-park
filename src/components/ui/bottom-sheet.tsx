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
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-2xl outline-none",
            className,
          )}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200" />
          <Drawer.Title className="px-5 pt-4 text-lg font-semibold text-slate-900">
            {title}
          </Drawer.Title>
          <div className="overflow-y-auto px-5 pb-6 pt-3 text-sm leading-relaxed text-slate-600">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
