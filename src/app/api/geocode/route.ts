import { NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const url =
    `${NOMINATIM}?` +
    new URLSearchParams({
      q: `${q}, Enschede, Netherlands`,
      format: "json",
      limit: "6",
      countrycodes: "nl",
    });

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "EnskePark/1.0 (https://enske-park.vercel.app)",
      },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: 502 });
    }
    const data = (await res.json()) as NominatimHit[];
    const results = data.map((hit) => ({
      label: hit.display_name.split(", Enschede")[0] ?? hit.display_name,
      fullLabel: hit.display_name,
      lat: Number.parseFloat(hit.lat),
      lon: Number.parseFloat(hit.lon),
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
