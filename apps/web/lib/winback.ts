/**
 * Win-back email, as a rule set with every outside effect passed in.
 *
 * Who: lapsed monthly members and one-off buyers. Nobody else. A reader who
 * ever held a yearly plan is never written to, lapsed or not. Nobody with a
 * live membership, a gift, a seat, an opt-out or a deletion under way is
 * written to, and nobody with a wellbeing title in their enrolments. Those
 * rules live in public.due_winback (migration 0055) next to the data.
 *
 * How often: at most once a season. A season is a meteorological one in UK
 * time. The season is claimed in public.winback_log before the message goes
 * and handed back if the send fails, so a second run, or a second scheduler,
 * sends nothing new and a failed send is tried again.
 *
 * What: one plain note. It never names a title and offers no discount. Every
 * message carries a one-click unsubscribe link, made for that reader and
 * stored as a hash.
 *
 * The switch is WINBACK_ENABLED. Blank means off and the job does nothing.
 */

export type Season = "winter" | "spring" | "summer" | "autumn";

/**
 * The season of a date, in UK time, as "2026-autumn". Winter runs December to
 * February and takes the year it started in, so January 2027 is "2026-winter".
 */
export function seasonKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (month === 12) return `${year}-winter`;
  if (month <= 2) return `${year - 1}-winter`;
  if (month <= 5) return `${year}-spring`;
  if (month <= 8) return `${year}-summer`;
  return `${year}-autumn`;
}

export function winbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.WINBACK_ENABLED ?? "").trim());
}

export interface DueWinback {
  userId: string;
  email: string;
  kind: "monthly" | "one_off";
}

export interface WinbackDeps {
  now: Date;
  limit: number;
  due(season: string, limit: number): Promise<DueWinback[]>;
  /** Claims the season for the reader. False when they were already written to. */
  claim(w: DueWinback, season: string, tokenHash: string): Promise<boolean>;
  release(w: DueWinback, season: string): Promise<void>;
  send(w: DueWinback, season: string, token: string): Promise<boolean>;
  mintToken(): string;
  hash(token: string): Promise<string>;
  log?(code: string, detail?: string): void;
}

export interface WinbackCounts {
  season: string;
  due: number;
  sent: number;
  already_sent: number;
  failed: number;
}

export async function runWinback(deps: WinbackDeps): Promise<WinbackCounts> {
  const season = seasonKey(deps.now);
  const counts: WinbackCounts = { season, due: 0, sent: 0, already_sent: 0, failed: 0 };
  const list = await deps.due(season, deps.limit);
  counts.due = list.length;
  for (const w of list) {
    const token = deps.mintToken();
    let claimed = false;
    try {
      claimed = await deps.claim(w, season, await deps.hash(token));
    } catch (e) {
      counts.failed += 1;
      deps.log?.("winback_claim_failed", e instanceof Error ? e.name : "unknown");
      continue;
    }
    if (!claimed) {
      counts.already_sent += 1;
      continue;
    }
    let ok = false;
    try {
      ok = await deps.send(w, season, token);
    } catch (e) {
      deps.log?.("winback_send_failed", e instanceof Error ? e.name : "unknown");
    }
    if (ok) {
      counts.sent += 1;
    } else {
      counts.failed += 1;
      try {
        await deps.release(w, season);
      } catch (e) {
        deps.log?.("winback_release_failed", e instanceof Error ? e.name : "unknown");
      }
    }
  }
  return counts;
}
