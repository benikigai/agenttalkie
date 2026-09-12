import { NextResponse } from "next/server";
import { activityProofLedger } from "@/lib/server/agenttalkie-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(activityProofLedger(), {
    headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
