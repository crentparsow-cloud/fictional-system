import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMailer, type MailerEnv, type Transport } from "@akana/emails";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron-auth";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { localParts } from "@/lib/today/reminders";
import type { Outgoing, PickupDeps, ReminderTarget, RunDeps, SendOutcome, StepContext } from "@/lib/today/run-reminders";
import { DEFAULT_STOP_AFTER } from "@/lib/today/reminders";
import { PICKUP_GAP_DAYS } from "@/lib/today/gap";
import { doneExerciseIds, nextStep, stepsFromUnitSections } from "@/lib/today/steps";
import type { UnitWord } from "@/lib/today/week";

/**
 * The real effects behind the three Today jobs (4.7, 14.3, 4.3, 4.9): the
 * secret check, the service role reads, the mailer with its claims. Used by
 * the routes under app/api/today. Addresses and ids are never logged or
 * returned. Only counts come back.
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export type CronSetup = { ok: true; admin: SupabaseClient; origin: string } | { ok: false; response: NextResponse };

/** Secret check and service client, the same way every other cron route does it. */
export function cronSetup(request: NextRequest): CronSetup {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, response: NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE }) };
  if (!cronAuthorised(request.headers, secret)) return { ok: false, response: NextResponse.json({ error: "unauthorised" }, { status: 401, headers: NO_STORE }) };
  try {
    return { ok: true, admin: createAdminClient(), origin: siteOrigin(request) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "not_configured" }, { status: 503, headers: NO_STORE }) };
  }
}

export function siteOrigin(request: NextRequest): string {
  const host = process.env.AKANA_HOST ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

interface TargetRow {
  enrolment_id: string;
  user_id: string;
  email: string;
  workbook_id: string;
  version_id: string;
  safety_tier: "none" | "standard" | "higher";
  last_opened_at: string;
  last_activity: string;
  sent_since_activity: number;
  reminder_days: number[];
  reminder_time: string;
  timezone: string;
  pickup_on: boolean | null;
}

export class SqlError extends Error {
  constructor(public code: string | undefined) {
    super("sql_failed");
  }
}

export async function configNumber(admin: SupabaseClient, key: string, fallback: number): Promise<number> {
  try {
    const { data } = await admin.from("app_config").select("value").eq("key", key).maybeSingle();
    const n = Number((data as { value?: unknown } | null)?.value);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  } catch {
    return fallback;
  }
}

async function loadTargetRows(admin: SupabaseClient): Promise<TargetRow[]> {
  const { data, error } = await admin.rpc("reminder_targets");
  if (error) throw new SqlError(error.code);
  return (data ?? []) as TargetRow[];
}

function toTargets(rows: readonly TargetRow[]): ReminderTarget[] {
  return rows.map((r) => ({
    enrolmentId: r.enrolment_id,
    userId: r.user_id,
    email: r.email,
    safetyTier: r.safety_tier,
    lastOpenedAt: r.last_opened_at,
    lastActivity: new Date(r.last_activity),
    sentSinceActivity: r.sent_since_activity,
    days: r.reminder_days,
    time: r.reminder_time,
    timeZone: r.timezone,
    pickupOn: r.pickup_on,
  }));
}

const loadTargets = async (admin: SupabaseClient) => toTargets(await loadTargetRows(admin));

/** The mailer, claiming each key in public.email_claims (0010) before it sends. */
export function todayMailer(admin: SupabaseClient, origin: string, env: MailerEnv = mailerEnvFromProcess(), transport?: Transport) {
  const mailer = createMailer({
    env,
    isSuppressed: () => false,
    log: (e) => console.info("today_mail", e.template, e.status, e.reason ?? ""),
    async claim(key) {
      const { data, error } = await admin.rpc("claim_email", { p_key: key });
      if (error) throw new SqlError(error.code);
      return data === true;
    },
    async release(key) {
      const { error } = await admin.rpc("release_email", { p_key: key });
      if (error) console.error("today_mail_release_failed", error.code ?? "unknown");
    },
    ...(transport ? { transport } : {}),
  });
  const base = { appUrl: `${origin}/today`, settingsUrl: `${origin}/you#today-settings`, supportEmail: env.EMAIL_REPLY_TO ?? "" };

  return {
    mailer,
    async send(mail: Outgoing): Promise<SendOutcome> {
      const to = mail.target.email;
      const opts = { to, userId: mail.target.userId, dedupeKey: mail.key };
      const goUrl = `${origin}/today/go?e=${mail.target.enrolmentId}`;
      const result =
        mail.kind === "step"
          ? await mailer.sendReader(
              "step_reminder",
              { ...base, stepName: mail.naming.stepName, unitWords: mail.naming.unitWords, subjectLabel: mail.naming.subjectLabel, minutes: mail.step.minutes, stepUrl: goUrl },
              opts,
            )
          : mail.kind === "stopping"
            ? await mailer.sendReader("reminders_stopping", { ...base, remindersUrl: base.settingsUrl }, opts)
            : await mailer.sendReader("welcome_back", { ...base, stepUrl: goUrl }, opts);
      if (result.status === "sent" || result.status === "sent_test") return "sent";
      if (result.status === "skipped" || result.status === "suppressed") return "already_sent";
      return "failed";
    },
  };
}

interface UnitContext {
  steps: ReturnType<typeof stepsFromUnitSections>;
  unitWord: UnitWord;
  titles: string[];
}

/** The reminder job's effects over the service role. */
export function reminderDeps(admin: SupabaseClient, origin: string, now: Date, stopAfter: number, mail = todayMailer(admin, origin)): RunDeps {
  const byVersion = new Map<string, Promise<UnitContext>>();
  const loadUnits = (versionId: string, workbookId: string): Promise<UnitContext> => {
    const cached = byVersion.get(versionId);
    if (cached) return cached;
    const p = (async (): Promise<UnitContext> => {
      const [{ data: units }, { data: listing }, { data: wb }] = await Promise.all([
        admin.from("workbook_sections").select("unit_number, body").eq("version_id", versionId).eq("kind", "unit"),
        admin.from("workbook_sections").select("structure:body->structure").eq("version_id", versionId).eq("kind", "listing").maybeSingle(),
        admin.from("workbooks").select("title, short_title").eq("id", workbookId).maybeSingle(),
      ]);
      const unit = (listing as { structure?: { unit?: string } } | null)?.structure?.unit;
      const word: UnitWord = unit === "week" || unit === "day" || unit === "module" || unit === "chapter" ? unit : "unit";
      const w = wb as { title?: string; short_title?: string | null } | null;
      return { steps: stepsFromUnitSections((units ?? []) as { unit_number: number | null; body: unknown }[]), unitWord: word, titles: [w?.title ?? "", w?.short_title ?? ""] };
    })();
    byVersion.set(versionId, p);
    return p;
  };
  const versionOf = new Map<string, { versionId: string; workbookId: string }>();

  return {
    now,
    stopAfter,
    async targets() {
      const rows = await loadTargetRows(admin);
      for (const r of rows) versionOf.set(r.enrolment_id, { versionId: r.version_id, workbookId: r.workbook_id });
      return toTargets(rows);
    },
    async stepFor(target): Promise<StepContext | null> {
      const ids = versionOf.get(target.enrolmentId);
      if (!ids) return null;
      const ctx = await loadUnits(ids.versionId, ids.workbookId);
      const { data: events } = await admin.from("progress_events").select("kind, ref").eq("enrolment_id", target.enrolmentId).eq("kind", "step_done").limit(3000);
      const step = nextStep(ctx.steps, doneExerciseIds((events ?? []) as { kind: string; ref: string | null }[]));
      return step ? { step, unitWord: ctx.unitWord, titles: ctx.titles } : null;
    },
    send: (m) => mail.send(m),
    async logSent(target, kind, ref, localDate) {
      const { error } = await admin.from("reminder_log").insert({ user_id: target.userId, enrolment_id: target.enrolmentId, kind, ref, local_date: localDate });
      if (error && error.code !== "23505") console.error("reminder_log_failed", error.code ?? "unknown");
    },
    async stop(enrolmentId) {
      const { error } = await admin.rpc("stop_reminders", { p_enrolment: enrolmentId });
      if (error) throw new SqlError(error.code);
    },
    log: (code, detail) => console.error(code, detail ?? ""),
  };
}

export function pickupDeps(admin: SupabaseClient, origin: string, now: Date, gapDays: number, mail = todayMailer(admin, origin)): PickupDeps {
  return {
    now,
    gapDays,
    targets: () => loadTargets(admin),
    async recentlyMailed(enrolmentId) {
      const since = new Date(now.getTime() - 36 * 3_600_000).toISOString();
      const { count } = await admin.from("reminder_log").select("id", { count: "exact", head: true }).eq("enrolment_id", enrolmentId).gte("sent_at", since);
      return (count ?? 0) > 0;
    },
    send: (m) => mail.send(m),
    async logSent(target, kind, ref, localDate) {
      const { error } = await admin.from("reminder_log").insert({ user_id: target.userId, enrolment_id: target.enrolmentId, kind, ref, local_date: localDate });
      if (error && error.code !== "23505") console.error("reminder_log_failed", error.code ?? "unknown");
    },
    localDate: (target, at) => localParts(at, target.timeZone).date,
    log: (code, detail) => console.error(code, detail ?? ""),
  };
}

export { DEFAULT_STOP_AFTER, PICKUP_GAP_DAYS };
