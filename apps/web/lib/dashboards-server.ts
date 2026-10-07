import "server-only";
import { NextResponse } from "next/server";
import type { StudioOrg } from "@/lib/studio-server";

/**
 * Server helpers for the dashboard CSV routes (F-041, F-042, F-058). The
 * database checks the role on every call; this only picks which of the
 * caller's own organisations the request is about.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The organisation named in ?org=, if the caller belongs to it, or their first one. */
export function pickOrg(orgs: readonly StudioOrg[], wanted: string | null): StudioOrg | null {
  if (orgs.length === 0) return null;
  if (wanted && UUID.test(wanted)) return orgs.find((o) => o.id === wanted) ?? null;
  return orgs[0]!;
}

/** A CSV download that is never cached and never sniffed as anything else. */
export function csvResponse(body: string, filename: string): NextResponse {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "-");
  // A byte order mark so spreadsheet programs read the pound sign and accents correctly.
  return new NextResponse(`﻿${body}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
