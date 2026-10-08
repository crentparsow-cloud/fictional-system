import { z } from "zod";

/**
 * Facilitator guide (F-212). A separate document from the workbook, written
 * by Akana staff for one workbook version and shown only to the leaders of a
 * group running that version. It holds discussion questions and timings per
 * unit. It never quotes or asks for anything a member wrote, and it never
 * asks a member to share answers with the group.
 *
 * Stored in public.facilitator_guides (migration 0028) as jsonb, with the
 * same sha256 content hash as workbook versions. Approved guides are
 * immutable. The claim word and Help now rules live in
 * @akana/validate (validateGuide).
 */

export const GUIDE_VERSION = "1" as const;

const Text = (max: number) => z.string().trim().min(1).max(max);
const Minutes = z.number().int().min(1).max(180);

export const GuideTimedText = z
  .object({
    text: Text(600),
    minutes: Minutes,
  })
  .strict();

export const GuideQuestion = z
  .object({
    question: Text(300),
    minutes: z.number().int().min(1).max(60),
    // A gentler or deeper follow-up the leader may use.
    follow_up: Text(300).optional(),
  })
  .strict();

export const GuideUnit = z
  .object({
    unit_number: z.number().int().min(1).max(99),
    // The planned length of the session, in minutes.
    minutes: z.number().int().min(15).max(180),
    aim: Text(300).optional(),
    opening: GuideTimedText.optional(),
    discussion: z.array(GuideQuestion).min(1).max(8),
    closing: GuideTimedText.optional(),
    // Practical notes for the leader only (room, materials, pacing).
    leader_note: Text(400).optional(),
  })
  .strict();

export const GuideSafety = z
  .object({
    // Remind the group, at the start of each session, where Help now is.
    help_now_reminder: z.boolean(),
    // For church groups: who the church's safeguarding lead is is never
    // stored here; this is the general wording about raising a concern.
    safeguarding_note: Text(400).optional(),
  })
  .strict();

export const FacilitatorGuide = z
  .object({
    guide_version: z.literal(GUIDE_VERSION),
    intro: Text(800).optional(),
    ground_rules: z.array(Text(200)).max(8).optional(),
    safety: GuideSafety,
    units: z.array(GuideUnit).min(1).max(99),
  })
  .strict()
  .superRefine((g, ctx) => {
    const seen = new Set<number>();
    g.units.forEach((u, i) => {
      if (seen.has(u.unit_number)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["units", i, "unit_number"], message: `unit ${u.unit_number} appears twice` });
      }
      seen.add(u.unit_number);
    });
  });

export type FacilitatorGuide = z.infer<typeof FacilitatorGuide>;
export type GuideUnit = z.infer<typeof GuideUnit>;

/** Minutes the plan for one unit adds up to: opening, questions and closing. */
export function guideUnitPlannedMinutes(u: GuideUnit): number {
  return (u.opening?.minutes ?? 0) + u.discussion.reduce((n, q) => n + q.minutes, 0) + (u.closing?.minutes ?? 0);
}
