import { NextResponse } from "next/server";
import { SCHEMA_VERSION } from "@akana/schema";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "akana-web",
    schema: SCHEMA_VERSION,
    time: new Date().toISOString(),
  });
}
