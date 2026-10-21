/**
 * Mental health lint (build list 11.3). Titles on the standard and higher
 * safety tiers (tiers 1 and 2) never count days, never set a daily goal and
 * never press the reader to hurry. This check finds the language that would.
 *
 * It runs inside validateWorkbook for those tiers, so it sits in the publish
 * path: Studio validation, the admin review check and `pnpm validate` all
 * call it. The app also runs it over its own streak, companion and mark
 * wording (apps/web/lib/habit/copy.test.ts), so a line written for a streak
 * screen cannot slip into a mental health context.
 *
 * Two strengths:
 *   - "hard" rules are errors. Streak and goal talk, countdowns, loss
 *     warnings and hurry words have no place in these titles.
 *   - "soft" rules are warnings. Missed-day and falling-behind talk can be
 *     kind ("a missed day leaves no mark"), so a person decides.
 *
 * A match with a negation just before it ("no streaks", "never a countdown")
 * is allowed: a title may say plainly that it does not do these things.
 */

export type HabitRule = "streak" | "daily_goal" | "urgency" | "loss_warning" | "missed_day";

export interface HabitHit {
  rule: HabitRule;
  severity: "error" | "warning";
  match: string;
  message: string;
}

interface Pattern {
  rule: HabitRule;
  severity: "error" | "warning";
  re: RegExp;
  message: string;
  /** An instruction: a negation before it does not excuse it ("Don't break the chain"). */
  instruction: boolean;
}

const P = (rule: HabitRule, severity: "error" | "warning", re: string, message: string, instruction = false): Pattern => ({
  rule,
  severity,
  re: new RegExp(re, "gi"),
  message,
  instruction,
});

const PATTERNS: readonly Pattern[] = [
  P("streak", "error", String.raw`\\bstreaks?\\b`, "streak language"),
  P("streak", "error", String.raw`\\b(days?|weeks?|times?) in a row\\b`, "counts days in a row"),
  P("streak", "error", String.raw`\\bconsecutive (days?|weeks?|sessions?)\\b`, "counts consecutive days"),
  P("streak", "error", String.raw`\\b(keep|keeping|break|breaking|protect|protecting) (the|your|a) (chain|run|streak)\\b`, "chain or run language", true),
  P("streak", "error", String.raw`\\bunbroken (run|chain|record|string|days?|weeks?)\\b`, "unbroken run language"),
  P("daily_goal", "error", String.raw`\\bdaily (goals?|targets?|quotas?)\\b`, "daily goal"),
  P("daily_goal", "error", String.raw`\\b(hit|meet|reach|smash|beat) (your|the|today's) (goal|target)\\b`, "goal to hit"),
  P("daily_goal", "error", String.raw`\\bgoal (met|reached|complete|achieved)\\b`, "goal status"),
  P("urgency", "warning", String.raw`\\bcountdowns?\\b`, "countdown (fine as a routine name, not as a timer on the reader)"),
  P("urgency", "error", String.raw`\\b(hurry|act now|right now or|before it'?s too late|last chance|running out of time|time is running)\\b`, "hurry or urgency"),
  P("urgency", "error", String.raw`\\bonly \\d+ (days?|hours?|minutes?|spots?|places?) (left|remaining)\\b`, "scarcity or countdown"),
  P("urgency", "error", String.raw`\\b(expires?|expiring|expiry) (in|on|soon|today|tonight)\\b`, "something that expires"),
  P("urgency", "error", String.raw`\\b(don'?t|do not) (miss|lose|waste)\\b`, "loss warning"),
  P("loss_warning", "error", String.raw`\\b(lose|losing|lost) your (progress|run|momentum|place)\\b`, "loss warning"),
  P("loss_warning", "error", String.raw`\\byou('| a)?re about to lose\\b`, "loss warning"),
  P("loss_warning", "error", String.raw`\\bdon'?t let (it|your \\w+) (slip|lapse|die)\\b`, "loss warning"),
  P("missed_day", "warning", String.raw`\\bmiss(ed|ing)? (a |an |the |your )?(day|days|session|sessions|week|weeks)\\b`, "talks about missed days"),
  P("missed_day", "warning", String.raw`\\b(falling|fallen|fell|get|getting|got) behind\\b`, "talks about falling behind"),
  P("missed_day", "warning", String.raw`\\bcatch(ing)? up on (missed|what you)\\b`, "talks about catching up"),
  P("missed_day", "warning", String.raw`\\boverdue\\b`, "talks about overdue work"),
];

const NEGATION = /\\b(no|not|never|nothing|without|none|neither|nor|isn'?t|aren'?t|won'?t|doesn'?t|don'?t|cannot|can'?t)\\b[^.;:!?]{0,40}$/i;

/** Every habit-language match in a piece of text. Negated matches are left out. */
export function habitLanguageHits(text: string): HabitHit[] {
  const out: HabitHit[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
      // "don't miss" is a hurry phrase in its own right; the negation rule must not excuse it.
      const selfNegated = p.instruction || /^(don'?t|do not)/i.test(m[0]);
      if (!selfNegated && NEGATION.test(before)) continue;
      out.push({ rule: p.rule, severity: p.severity, match: m[0], message: p.message });
    }
  }
  return out;
}

/** True when the text has no error-level habit language. */
export function habitLanguageClean(text: string): boolean {
  return !habitLanguageHits(text).some((h) => h.severity === "error");
}
