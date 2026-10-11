import { NextResponse } from "next/server";
import { durationRestrictionsData as durationRestrictions } from "@/data/duration-restrictions-data";
import { stadserfBoundaryData as stadserfBoundary } from "@/data/stadserf-boundary-data";

export async function GET() {
  return NextResponse.json({
    durationRestrictions,
    stadserfBoundary,
    fetchedAt: new Date().toISOString(),
  });
}
