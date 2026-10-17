import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFeed, scheduleSteps } from "@/lib/today/ics";
import { nameStep } from "@/lib/today/reminders";
import { doneExerciseIds, remainingSteps, stepsFromUnitSections } from "@/lib/today/steps";
import type { UnitWord } from "@/lib/today/week";

/**
 * The calendar feed for one programme (4.8): the steps still to do, one
 * all-day event each, on the weekdays the reader chose in You.
 *
 *   GET /api/today/calendar/<token>.ics
 *
 * The URL is the only credential. The token is 64 hex characters, made in
 * the database (public.new_calendar_token), shown to the reader once, and
 * kept only as a sha256 hash. Making a new link stops the old one. The feed
 * holds unit names (just "Week 3" for a wellbeing title), a link to Today
 * and nothing else: no answers, no field labels, never the workbook title.
 * A wrong token is a plain 404 whatever the reason.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN = /^[0-9a-f]{64}$/;
const HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "private, max-age=900",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
} as const;

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!TOKEN.test(token)) return notFound();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return new NextResponse("Not available", { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin.rpc("calendar_feed_target", { p_hash: hash });
  const target = (data as { enrolment_id: string; version_id: string; workbook_id: string; safety_tier: "none" | "standard" | "higher"; reminder_days: number[]; timezone: string }[] | null)?.[0];
  if (error || !target) return notFound();

  const [{ data: units }, { data: listing }, { data: events }, { data: wb }] = await Promise.all([
    admin.from("workbook_sections").select("unit_number, body").eq("version_id", target.version_id).eq("kind", "unit"),
    admin.from("workbook_sections").select("structure:body->structure").eq("version_id", target.version_id).eq("kind", "listing").maybeSingle(),
    admin.from("progress_events").select("kind, ref").eq("enrolment_id", target.enrolment_id).eq("kind", "step_done").limit(3000),
    admin.from("workbooks").select("title, short_title").eq("id", target.workbook_id).maybeSingle(),
  ]);
  const unit = (listing as { structure?: { unit?: string } } | null)?.structure?.unit;
  const word: UnitWord = unit === "week" || unit === "day" || unit === "module" || unit === "chapter" ? unit : "unit";
  const w = wb as { title?: string; short_title?: string | null } | null;
  const steps = stepsFromUnitSections((units ?? []) as { unit_number: number | null; body: unknown }[]);
  const left = remainingSteps(steps, doneExerciseIds((events ?? []) as { kind: string; ref: string | null }[]));

  const now = new Date();
  const placed = scheduleSteps(left, target.reminder_days, now, target.timezone);
  const host = process.env.AKANA_HOST ?? request.headers.get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const body = buildFeed({
    feedId: hash.slice(0, 12),
    now,
    openUrl: `${origin}/today/go?e=${target.enrolment_id}`,
    items: placed.map(({ date, step }) => ({
      date,
      item: { step, name: nameStep(step, word, [w?.title, w?.short_title], target.safety_tier).subjectLabel },
    })),
  });
  return new NextResponse(body, { status: 200, headers: HEADERS });
}
