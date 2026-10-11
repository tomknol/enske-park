import { Suspense } from "react";
import { EnskeParkApp } from "@/components/enske-park-app";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center bg-slate-100 text-sm text-slate-600">
          Kaart laden…
        </div>
      }
    >
      <EnskeParkApp />
    </Suspense>
  );
}
