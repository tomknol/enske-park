import { NextResponse } from "next/server";
import type { FeatureCollection } from "geojson";

const SERVICE_BASE =
  "https://geoportaal.enschede.nl/arcgis/rest/services/Parkeren_Parkeervergunningzones/MapServer";

async function fetchLayer(layerId: number): Promise<FeatureCollection> {
  const url =
    `${SERVICE_BASE}/${layerId}/query?` +
    new URLSearchParams({
      where: "1=1",
      outFields: "*",
      outSR: "4326",
      f: "geojson",
    });

  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`ArcGIS layer ${layerId} failed: ${res.status}`);
  }

  const data = (await res.json()) as FeatureCollection;
  return data;
}

export async function GET() {
  try {
    const [permitRaw, paidRaw] = await Promise.all([fetchLayer(0), fetchLayer(1)]);

    const permit = {
      ...permitRaw,
      features: permitRaw.features.map((f) => ({
        ...f,
        properties: { ...f.properties, layer: "permit" as const },
      })),
    };

    const paid = {
      ...paidRaw,
      features: paidRaw.features.map((f) => ({
        ...f,
        properties: { ...f.properties, layer: "paid" as const },
      })),
    };

    return NextResponse.json({
      permit,
      paid,
      fetchedAt: new Date().toISOString(),
      source: SERVICE_BASE,
    });
  } catch {
    return NextResponse.json(
      { error: "Parkeerdata tijdelijk niet beschikbaar" },
      { status: 503 },
    );
  }
}
