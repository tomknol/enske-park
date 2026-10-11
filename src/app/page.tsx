import { Suspense } from "react";
import { EnskeParkApp } from "@/components/enske-park-app";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="app-boot h-[100dvh]">
          <div className="app-boot-spinner" role="status" aria-label="Laden" />
          <p className="app-boot-mark">ENSKE PARK</p>
        </div>
      }
    >
      <EnskeParkApp />
    </Suspense>
  );
}
