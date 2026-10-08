import { FacilitatorGuide, guideUnitPlannedMinutes, type FacilitatorGuide as Guide, type Genre, type SafetyTier } from "@akana/schema";
import { BANNED_CHARS, CLAIM_ALLOW, EMOJI, claimPatterns } from "./rules";

/**
 * Facilitator guide rules (F-212). Schema first, then:
 *   - claim words, with the same lists as the workbook's genre and tier
 *   - no em dashes or other banned characters, no emojis
 *   - wellbeing titles (tier standard or higher, or the wellbeing genre)
 *     must remind the group of Help now
 *   - every unit in the guide must exist in the workbook version
 *   - a unit's planned minutes must fit the session length (a warning)
 *   - no question asks members to read out or share what they wrote
 */

export interface GuideFinding {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface GuideResult {
  ok: boolean;
  errors: GuideFinding[];
  warnings: GuideFinding[];
  guide?: Guide;
}

// Asking people to read out or hand over their answers breaks the sealed
// answers promise in practice, even if nothing technical leaks.
const SHARE_ANSWERS_RE =
  /\b(read (out|aloud)|share|show)\b[^.?!]{0,40}\b(your|their) (answers?|responses?|writing|workbook|journal)\b/i;

function walk(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, out);
}

export function validateGuide(
  input: unknown,
  ctx: { genre: Genre; tier: SafetyTier; unitNumbers?: readonly number[] },
): GuideResult {
  const parsed = FacilitatorGuide.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ severity: "error", path: i.path.join("."), message: i.message })),
      warnings: [],
    };
  }
  const guide = parsed.data;
  const errors: GuideFinding[] = [];
  const warnings: GuideFinding[] = [];

  const strings: { path: string; text: string }[] = [];
  walk(guide, "", strings);
  const claims = claimPatterns(ctx.genre, ctx.tier);
  for (const s of strings) {
    const cleaned = s.text.replace(CLAIM_ALLOW, "");
    for (const m of cleaned.matchAll(claims)) errors.push({ severity: "error", path: s.path, message: `claim word '${m[0]}'` });
    for (const [ch, name] of Object.entries(BANNED_CHARS)) {
      if (s.text.includes(ch)) errors.push({ severity: "error", path: s.path, message: `no ${name}` });
    }
    if (EMOJI.test(s.text)) errors.push({ severity: "error", path: s.path, message: "no emojis" });
    if (SHARE_ANSWERS_RE.test(s.text)) {
      errors.push({ severity: "error", path: s.path, message: "never ask members to share or read out what they wrote" });
    }
  }

  const wellbeing = ctx.tier !== "none" || ctx.genre === "wellbeing";
  if (wellbeing && !guide.safety.help_now_reminder) {
    errors.push({ severity: "error", path: "safety.help_now_reminder", message: "a wellbeing title's guide must remind the group of Help now" });
  }

  guide.units.forEach((u, i) => {
    if (ctx.unitNumbers && ctx.unitNumbers.length > 0 && !ctx.unitNumbers.includes(u.unit_number)) {
      errors.push({ severity: "error", path: `units[${i}].unit_number`, message: `unit ${u.unit_number} is not in this workbook version` });
    }
    const planned = guideUnitPlannedMinutes(u);
    if (planned > u.minutes) {
      warnings.push({ severity: "warning", path: `units[${i}]`, message: `the plan adds up to ${planned} minutes, more than the ${u.minutes} minute session` });
    }
  });

  return { ok: errors.length === 0, errors, warnings, guide };
}
