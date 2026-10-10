import { gapDue, PICKUP_GAP_DAYS } from "@/lib/today/gap";
import { nameStep, oneProgrammePerReader, reminderAction, reminderDue, reminderKey, stoppingKey, welcomeBackKey, DEFAULT_STOP_AFTER, type StepNaming } from "@/lib/today/reminders";
import type { ProgrammeStep } from "@/lib/today/steps";
import type { UnitWord } from "@/lib/today/week";

/**
 * The reminder job (4.7, 14.3) and the pick-up check (4.9), with every
 * outside effect passed in, so the rules can be tested without a database
 * or a mail server. The routes in app/api/today wire in the real ones.
 *
 * Both jobs are idempotent. A reminder is claimed under a key made of the
 * reader, programme, step and local date; a stopping email under the
 * programme and date; a welcome-back under the programme and the date the
 * reader was last active. A second run, or the same job from two schedulers,
 * sends nothing new.
 */

export interface ReminderTarget {
  enrolmentId: string;
  userId: string;
  email: string;
  safetyTier: "none" | "standard" | "higher";
  lastOpenedAt: string;
  lastActivity: Date;
  sentSinceActivity: number;
  days: readonly number[];
  time: string;
  timeZone: string;
  pickupOn: boolean | null;
}

export interface StepContext {
  step: ProgrammeStep;
  unitWord: UnitWord;
  /** Workbook title and short title, only to keep them out of the email. */
  titles: readonly (string | null | undefined)[];
}

export type SendOutcome = "sent" | "already_sent" | "failed";

export type Outgoing =
  | { kind: "step"; target: ReminderTarget; naming: StepNaming; step: ProgrammeStep; key: string; localDate: string }
  | { kind: "stopping"; target: ReminderTarget; key: string; localDate: string }
  | { kind: "welcome_back"; target: ReminderTarget; key: string; localDate: string };

export interface RunDeps {
  now: Date;
  stopAfter?: number;
  targets(): Promise<ReminderTarget[]>;
  /** The next unfinished step of the programme, or null when there is none to name. */
  stepFor(target: ReminderTarget): Promise<StepContext | null>;
  send(mail: Outgoing): Promise<SendOutcome>;
  /** Records the send in reminder_log (ids and local date). */
  logSent(target: ReminderTarget, kind: "step" | "stopping" | "welcome_back", ref: string | null, localDate: string): Promise<void>;
  /** Turns the programme's reminders off and stamps the stop. */
  stop(enrolmentId: string): Promise<void>;
  log?(code: string, detail?: string): void;
}

export interface ReminderCounts {
  considered: number;
  not_due: number;
  sent: number;
  stopped: number;
  already_sent: number;
  no_step: number;
  failed: number;
}

export async function runReminders(deps: RunDeps): Promise<ReminderCounts> {
  const counts: ReminderCounts = { considered: 0, not_due: 0, sent: 0, stopped: 0, already_sent: 0, no_step: 0, failed: 0 };
  const stopAfter = deps.stopAfter ?? DEFAULT_STOP_AFTER;
  const all = await deps.targets();
  counts.considered = all.length;

  const due: { target: ReminderTarget; localDate: string }[] = [];
  for (const target of all) {
    const d = reminderDue({ enabled: true, days: target.days, time: target.time, timeZone: target.timeZone }, deps.now);
    if (d.due) due.push({ target, localDate: d.localDate });
    else counts.not_due += 1;
  }

  // A reader with two programmes due on one day gets one email, for the one they opened last.
  const chosen = oneProgrammePerReader(due.map((d) => ({ ...d, userId: d.target.userId, lastOpenedAt: d.target.lastOpenedAt })));

  for (const { target, localDate } of chosen) {
    try {
      const action = reminderAction({ enabled: true, sentSinceActivity: target.sentSinceActivity, stopAfter });
      if (action === "stop_notice") {
        const outcome = await deps.send({ kind: "stopping", target, key: stoppingKey(target.enrolmentId, localDate), localDate });
        if (outcome === "failed") {
          counts.failed += 1;
          continue;
        }
        if (outcome === "already_sent") counts.already_sent += 1;
        else counts.stopped += 1;
        await deps.logSent(target, "stopping", null, localDate);
        await deps.stop(target.enrolmentId);
        continue;
      }
      const ctx = await deps.stepFor(target);
      if (!ctx) {
        counts.no_step += 1;
        continue;
      }
      const naming = nameStep(ctx.step, ctx.unitWord, ctx.titles, target.safetyTier);
      const key = reminderKey(target.userId, target.enrolmentId, ctx.step.exerciseId, localDate);
      const outcome = await deps.send({ kind: "step", target, naming, step: ctx.step, key, localDate });
      if (outcome === "failed") counts.failed += 1;
      else if (outcome === "already_sent") counts.already_sent += 1;
      else {
        counts.sent += 1;
        await deps.logSent(target, "step", ctx.step.exerciseId, localDate);
      }
    } catch (err) {
      counts.failed += 1;
      deps.log?.("reminder_failed", err instanceof Error ? err.message.slice(0, 80) : "unknown");
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The pick-up check (4.9)
// ---------------------------------------------------------------------------

/** Wellbeing titles are off until the reader turns the welcome-back note on. */
export function pickupAllowed(pickupOn: boolean | null, safetyTier: "none" | "standard" | "higher"): boolean {
  return pickupOn ?? safetyTier === "none";
}

export interface PickupDeps {
  now: Date;
  gapDays?: number;
  targets(): Promise<ReminderTarget[]>;
  /** True when the programme was mailed (a reminder, a stop or a welcome-back) in the last 36 hours. */
  recentlyMailed(enrolmentId: string): Promise<boolean>;
  send(mail: Outgoing): Promise<SendOutcome>;
  logSent(target: ReminderTarget, kind: "welcome_back", ref: string | null, localDate: string): Promise<void>;
  localDate(target: ReminderTarget, now: Date): string;
  log?(code: string, detail?: string): void;
}

export interface PickupCounts {
  considered: number;
  no_gap: number;
  not_allowed: number;
  recently_mailed: number;
  sent: number;
  already_sent: number;
  failed: number;
}

/**
 * One plain welcome-back email per gap, only to a reader who turned
 * reminders on and has not switched the welcome-back note off (it is off by
 * default for wellbeing titles). The gap is compared with a threshold and
 * never shown or sent.
 */
export async function runPickup(deps: PickupDeps): Promise<PickupCounts> {
  const counts: PickupCounts = { considered: 0, no_gap: 0, not_allowed: 0, recently_mailed: 0, sent: 0, already_sent: 0, failed: 0 };
  const all = [...(await deps.targets())].sort((a, b) => Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt));
  counts.considered = all.length;
  const gap = deps.gapDays ?? PICKUP_GAP_DAYS;
  const seen = new Set<string>();
  for (const target of all) {
    try {
      if (!gapDue(target.lastActivity, deps.now, gap)) {
        counts.no_gap += 1;
        continue;
      }
      if (!pickupAllowed(target.pickupOn, target.safetyTier)) {
        counts.not_allowed += 1;
        continue;
      }
      // One welcome-back a day per reader, for the programme they opened last.
      if (seen.has(target.userId)) continue;
      seen.add(target.userId);
      if (await deps.recentlyMailed(target.enrolmentId)) {
        counts.recently_mailed += 1;
        continue;
      }
      const localDate = deps.localDate(target, deps.now);
      const outcome = await deps.send({ kind: "welcome_back", target, key: welcomeBackKey(target.enrolmentId, target.lastActivity), localDate });
      if (outcome === "failed") counts.failed += 1;
      else if (outcome === "already_sent") counts.already_sent += 1;
      else {
        counts.sent += 1;
        await deps.logSent(target, "welcome_back", target.lastActivity.toISOString().slice(0, 10), localDate);
      }
    } catch (err) {
      counts.failed += 1;
      deps.log?.("pickup_failed", err instanceof Error ? err.message.slice(0, 80) : "unknown");
    }
  }
  return counts;
}
