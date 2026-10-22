import { oneProgrammePerReader, reminderDue, DEFAULT_STOP_AFTER } from "@/lib/today/reminders";
import type { ReminderTarget } from "@/lib/today/run-reminders";

/**
 * The daily step push (13.19), with every outside effect passed in so the
 * rules can be tested without a database or a push service. The route in
 * app/api/push/daily wires in the real ones.
 *
 * Rules, in order, for each reader:
 *  - Only on the days and at the time the reader chose for their reminders
 *    (the same settings as the email reminder), in their own time zone.
 *  - Only readers who asked for push on at least one device, and only while
 *    the web_push flag is on for them.
 *  - Never for a title above safety tier none. Nothing nags on those shelves.
 *  - Never when they already finished a step today, or have no step left.
 *  - One push a day: the push_log claim is taken before sending, so a second
 *    run, or two schedulers, sends nothing new.
 *  - It stops by itself. Reminders and pushes sent since the reader last
 *    opened or finished anything are added up, and at the same limit as the
 *    email reminder no more are sent until they come back.
 *  - The message has no body of its own. The wording is fixed in the service
 *    worker, so no title, unit or count is ever sent.
 */

export interface PushSubscriptionRef {
  id: string;
  endpoint: string;
}

export type PushOutcome = "sent" | "gone" | "failed";

export interface PushDeps {
  now: Date;
  stopAfter?: number;
  targets(): Promise<ReminderTarget[]>;
  flagOn(userId: string): boolean;
  subscriptions(userId: string): PushSubscriptionRef[];
  /** Pushes sent to this reader after `since`. */
  pushedSince(userId: string, since: Date): Promise<number>;
  /** True when a next step exists and the reader has not finished one today. */
  stepWaiting(target: ReminderTarget, localDate: string): Promise<boolean>;
  /** Takes the day's claim. False when it was already taken. */
  claim(userId: string, localDate: string): Promise<boolean>;
  release(userId: string, localDate: string): Promise<void>;
  send(sub: PushSubscriptionRef): Promise<PushOutcome>;
  remove(subId: string): Promise<void>;
  log?(code: string, detail?: string): void;
}

export interface PushCounts {
  considered: number;
  not_due: number;
  not_allowed: number;
  no_subscription: number;
  nothing_waiting: number;
  stopped: number;
  already_sent: number;
  sent: number;
  failed: number;
}

export async function runDailyPush(deps: PushDeps): Promise<PushCounts> {
  const counts: PushCounts = { considered: 0, not_due: 0, not_allowed: 0, no_subscription: 0, nothing_waiting: 0, stopped: 0, already_sent: 0, sent: 0, failed: 0 };
  const stopAfter = Math.max(1, Math.floor(deps.stopAfter ?? DEFAULT_STOP_AFTER));
  const all = await deps.targets();
  counts.considered = all.length;

  const due: { target: ReminderTarget; localDate: string }[] = [];
  for (const target of all) {
    if (target.safetyTier !== "none") {
      counts.not_allowed += 1;
      continue;
    }
    const d = reminderDue({ enabled: true, days: target.days, time: target.time, timeZone: target.timeZone }, deps.now);
    if (d.due) due.push({ target, localDate: d.localDate });
    else counts.not_due += 1;
  }

  const chosen = oneProgrammePerReader(due.map((d) => ({ ...d, userId: d.target.userId, lastOpenedAt: d.target.lastOpenedAt })));
  for (const { target, localDate } of chosen) {
    try {
      if (!deps.flagOn(target.userId)) {
        counts.not_allowed += 1;
        continue;
      }
      const subs = deps.subscriptions(target.userId);
      if (subs.length === 0) {
        counts.no_subscription += 1;
        continue;
      }
      const pushed = await deps.pushedSince(target.userId, target.lastActivity);
      if (target.sentSinceActivity + pushed >= stopAfter) {
        counts.stopped += 1;
        continue;
      }
      if (!(await deps.stepWaiting(target, localDate))) {
        counts.nothing_waiting += 1;
        continue;
      }
      if (!(await deps.claim(target.userId, localDate))) {
        counts.already_sent += 1;
        continue;
      }
      let delivered = 0;
      for (const sub of subs) {
        const outcome = await deps.send(sub);
        if (outcome === "sent") delivered += 1;
        else if (outcome === "gone") await deps.remove(sub.id);
      }
      if (delivered > 0) counts.sent += 1;
      else {
        // Nothing reached a device: free the claim so the next run inside the window can try again.
        await deps.release(target.userId, localDate);
        counts.failed += 1;
      }
    } catch (err) {
      counts.failed += 1;
      deps.log?.("push_failed", err instanceof Error ? err.message.slice(0, 80) : "unknown");
    }
  }
  return counts;
}
