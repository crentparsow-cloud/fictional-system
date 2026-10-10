import { z } from "zod";
import { CODE_PATTERN } from "./codes";

/**
 * Akana workbook schema, version 3.0.
 *
 * This is the schema the feature list calls v3 (F-107) and the architecture
 * note calls 2.0 (section 5). Same thing. It keeps every v1 concept and makes
 * the programme shape a setting, so a 4-week finance course and a 12-week
 * wellbeing programme share one engine.
 *
 * Word limits, claim words, house style, cross-references and per-genre counts
 * are enforced by @akana/validate, not here. This file is structure only.
 *
 * Frozen at the end of Thursday 8 October 2026. Changes after that need a
 * new minor version and a migration.
 */

export const SCHEMA_VERSION = "3.1" as const;

/**
 * Versions a file may declare. 3.1 (10 October 2026) adds the optional
 * units[].intro, ideas and takeaway fields from docs/content/UNIT_SPEC.md.
 * Additive only: every 3.0 file stays valid and parses to the same result.
 */
export const SUPPORTED_SCHEMA_VERSIONS = ["3.0", "3.1"] as const;

// Identifier used inside a workbook: exercises, fields, stages, plan sections.
export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, "lower-case id, letters, digits and underscores");
export const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lower-case slug");
export const Figure = z.string().regex(/^fig_[a-z0-9_]+$/);

export const GENRES = [
  "wellbeing",
  "personal_development",
  "relationships",
  "parenting",
  "career",
  "leadership",
  "business",
  "productivity",
  "finance",
  "education",
  "life_skills",
] as const;
export const Genre = z.enum(GENRES);
export type Genre = z.infer<typeof Genre>;

// none: no Help now, no health data consent.
// standard: Help now on every screen, health data consent, claim rules in full.
// higher: as standard, keeps the Start screen gate and needs clinician sign-off.
export const SafetyTier = z.enum(["none", "standard", "higher"]);
export type SafetyTier = z.infer<typeof SafetyTier>;

export const ADVICE_GUARDRAILS = ["none", "not_legal_or_tax_advice", "not_medical_advice", "not_financial_advice"] as const;
export const AdviceGuardrail = z.enum(ADVICE_GUARDRAILS);
export type AdviceGuardrail = z.infer<typeof AdviceGuardrail>;

/**
 * Older names accepted on input and rewritten to the canonical value.
 * money_guidance_not_advice: used by the six finance titles in the demo
 * catalogue. The genre registry gives finance not_financial_advice, so it maps
 * there. Added 8 October 2026, before the freeze. Additive: every value that
 * parsed before still parses to the same result.
 */
export const ADVICE_GUARDRAIL_ALIASES = { money_guidance_not_advice: "not_financial_advice" } as const;
export const AdviceGuardrailInput = z.union([
  AdviceGuardrail,
  z.enum(["money_guidance_not_advice"]).transform((v) => ADVICE_GUARDRAIL_ALIASES[v]),
]);

export const Depth = z.enum(["listing", "outline", "first_unit", "full"]);
export const Spelling = z.enum(["en-GB", "en-US"]);
export const Badge = z.enum(["official", "made_with_author", "public_domain", "demo"]);
export const Unit = z.enum(["week", "day", "module", "chapter"]);

export const FIELD_TYPES = [
  // Carried from v1
  "short_text",
  "long_text",
  "scale_0_10",
  "checklist",
  "ranked_list",
  "two_column",
  "time_of_day",
  "weekly_grid",
  "yes_no",
  "rating_grid",
  // New in v3 for non-wellbeing genres (F-113). Renderers land in week 3.
  "number",
  "currency",
  "table",
  "decision_matrix",
] as const;
export const FieldType = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldType>;

export const Field = z
  .object({
    id: Id,
    type: FieldType,
    label: z.string(),
    help: z.string().optional(),
    options: z.array(z.string()).optional(),
    columns: z.array(z.string()).min(2).max(6).optional(),
    rows: z.array(z.string()).optional(),
    min_items: z.number().int().optional(),
    max_items: z.number().int().optional(),
    optional: z.boolean().optional(),
    // number and currency
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().optional(),
    // table and decision_matrix: compute a total or a weighted score per row
    computed: z.enum(["sum", "mean", "weighted_sum"]).optional(),
    // Carry an answer from an earlier field into this one as a starting value.
    prefill_from: Id.optional(),
    // The answer may be hard to write (F-022). After a save in a wellbeing
    // workbook the reader sees a quiet Help now card, at most once a week.
    // Optional and additive (7 Oct 2026); absent means false.
    sensitive: z.boolean().optional(),
  })
  .strict();
export type Field = z.infer<typeof Field>;

export const Source = z.object({ chapter: z.string(), note: z.string().optional() }).strict();
export const Step = z.object({ text: z.string(), figure: Figure.optional() }).strict();

export const Exercise = z
  .object({
    id: Id,
    title: z.string(),
    purpose: z.string(),
    why: z.string(),
    source: Source,
    minutes: z.number().int().min(1).max(60),
    steps: z.array(Step).min(1).max(10),
    example: z.object({ character: z.string(), text: z.string() }).strict().optional(),
    fields: z.array(Field).min(1).max(8),
    reflect: z.string().optional(),
    feeds_plan: z.array(z.object({ field_id: Id, plan_section: Id }).strict()).optional(),
    short_version: z
      .object({
        minutes: z.number().int().min(1).max(5),
        steps: z.array(Step).min(1).max(3),
        field_ids: z.array(Id).min(1).max(2),
      })
      .strict()
      .optional(),
    done_when: z.string(),
    repeat_units: z.array(z.number().int().min(1)).optional(),
    toolkit_link: Id.optional(),
    stuck_alternative: Id.optional(),
    safety_link: z.boolean().optional(),
    community: z.boolean().optional(),
    together: z.string().optional(),
  })
  .strict();
export type Exercise = z.infer<typeof Exercise>;

export const ToolkitCard = z
  .object({
    id: Id,
    title: z.string(),
    when_to_use: z.string(),
    steps: z.array(z.string()).min(2).max(6),
    minutes: z.number().int().min(1).max(15),
    figure: Figure.optional(),
    source: Source,
    safety_link: z.boolean().optional(),
    together: z.string().optional(),
  })
  .strict();

export const Stage = z
  .object({
    id: Id,
    number: z.number().int().min(1).max(6),
    name: z.string(),
    units: z.array(z.number().int().min(1)),
    primer: z.object({ title: z.string(), body: z.string(), figure: Figure.optional() }).strict().optional(),
    outcome: z.string().optional(),
    review_question: z.string().optional(),
  })
  .strict();

export const Structure = z
  .object({
    unit: Unit,
    count: z.number().int().min(1).max(52),
    stages: z.array(Stage).max(6).optional(),
    // Which units a reader gets before paying. Default is the first unit (F-019).
    free_units: z.number().int().min(0).max(4).default(1),
  })
  .strict();

/** One key idea in a unit (3.1): a sentence heading, a short explanation and one example. */
export const KeyIdea = z
  .object({
    heading: z.string(),
    body: z.string(),
    example: z.string(),
  })
  .strict();
export type KeyIdea = z.infer<typeof KeyIdea>;

export const ProgrammeUnit = z
  .object({
    number: z.number().int().min(1),
    stage: Id.optional(),
    focus: z.string(),
    exercise_ids: z.array(Id).min(1).max(3),
    new_toolkit_ids: z.array(Id).optional(),
    selfcheck: z.boolean().optional(),
    repeat_ids: z.array(Id).max(2).optional(),
    // Added in 3.1, all optional. Counts and word limits are checked by @akana/validate.
    intro: z.string().optional(),
    ideas: z.array(KeyIdea).max(10).optional(),
    takeaway: z.string().optional(),
  })
  .strict();

export const SelfCheck = z
  .object({
    intro: z.string(),
    scale_labels: z.array(z.string()).length(5),
    areas: z.array(z.object({ id: Id, label: z.string() }).strict()).min(2).max(6),
    items: z
      .array(
        z
          .object({
            id: Id,
            area: Id,
            text: z.string(),
            reverse_scored: z.boolean().optional(),
            safety_item: z.boolean().optional(),
          })
          .strict(),
      )
      .min(4)
      .max(24),
    result_note: z.string(),
    // Wellbeing tiers must leave this false: the validator enforces it.
    scored: z.boolean().default(false),
  })
  .strict();

export const CheckIn = z
  .object({
    fields: z.array(Field).min(2).max(6),
    short_field_ids: z.array(Id).min(1).max(2),
  })
  .strict();

export const DailyCheck = z
  .object({
    question: z.string(),
    scale_low: z.string(),
    scale_high: z.string(),
    tags: z.array(z.string()).min(3).max(8),
  })
  .strict();

export const Milestone = z
  .object({
    id: Id,
    // Machine trigger, e.g. first_exercise, unit_complete:3, stage_complete:build,
    // toolkit_uses:10. No trigger may count consecutive days (no streaks).
    // daily_checks:N counts checks done in total, never in a row. return_after_gap
    // is a welcome back, never a reproach.
    trigger: z
      .string()
      .regex(
        /^(first_exercise|first_toolkit_use|first_repeat|return_after_gap|program_complete|finished|unit_complete:\d+|stage_complete:[a-z0-9_]+|toolkit_uses:\d+|daily_checks:\d+|selfcheck:\d+|exercises_done:\d+|plan_lines:\d+)$/,
      ),
    message: z.string(),
  })
  .strict();

export const SafetyHub = z
  .object({
    intro: z.string().optional(),
    points: z.array(z.object({ title: z.string(), text: z.string() }).strict()).min(1).max(8),
    see_doctor: z.array(z.string()).min(1).max(8),
    emergency: z.array(z.string()).max(6).optional(),
  })
  .strict();

export const BookRef = z
  .object({
    book_id: Slug,
    title: z.string(),
    subtitle: z.string().optional(),
    // Store links by market, e.g. { "GB": "https://amazon.co.uk/dp/..." }
    store_links: z.record(z.string(), z.string().url()).optional(),
    isbn: z.string().optional(),
    asin: z.string().optional(),
    year: z.number().int().optional(),
    publisher: z.string().optional(),
  })
  .strict();

export const AuthorRef = z
  .object({
    author_id: z.string().regex(CODE_PATTERN),
    display_name: z.string(),
  })
  .strict();

export const WorkbookV3 = z
  .object({
    schema_version: z.enum(SUPPORTED_SCHEMA_VERSIONS),

    // Identity (title-first, decision carried from the naming board)
    code: z.string().regex(/^AK-[0-9A-HJKMNP-TV-Z]{5}$/),
    slug: Slug,
    title: z.string(),
    short_title: z.string().optional(),
    card_line: z.string(),
    tagline: z.string().optional(),
    book: BookRef,
    author: AuthorRef,
    publisher_id: z.string().regex(CODE_PATTERN).optional(),

    // Catalogue
    genre: Genre,
    theme_id: Slug.optional(),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    spelling: Spelling,
    is_demo: z.boolean(),
    depth: Depth,
    badge: Badge,
    licence_ref: z.string().optional(),
    status: z.enum(["template", "draft", "in_review", "approved", "live", "paused", "retired"]).optional(),

    // Safety
    safety_tier: SafetyTier,
    // Finance and business workbooks must carry this note (genre guardrail).
    // money_guidance_not_advice is accepted and stored as not_financial_advice.
    advice_guardrail: AdviceGuardrailInput.optional(),

    // Shape
    structure: Structure,

    // Content
    start: z
      .object({
        welcome: z.string(),
        how_it_works: z.array(z.string()).min(2).max(5),
        why_prompt: z.string(),
        higher_tier_note: z.string().optional(),
        extra_safety_note: z.string().optional(),
        author_note: z.string().optional(),
      })
      .strict(),
    selfcheck: SelfCheck.optional(),
    checkin: CheckIn.optional(),
    daily_check: DailyCheck.optional(),
    units: z.array(ProgrammeUnit).min(1),
    exercises: z.array(Exercise).min(1),
    toolkit: z.array(ToolkitCard).max(20).default([]),
    milestones: z.array(Milestone).default([]),
    plan_sections: z.array(z.object({ id: Id, title: z.string() }).strict()).max(6).default([]),
    finish: z
      .object({
        summary: z.string(),
        book_bridge: z.string(),
        related_codes: z.array(z.string()).optional(),
      })
      .strict(),
    keep_going: z
      .object({
        monthly_questions: z.array(z.string()).min(1).max(4),
        refresher_ids: z.array(Id),
      })
      .strict()
      .optional(),
    safety_hub: SafetyHub.optional(),

    // House only. Never served to a reader.
    internal: z
      .object({
        manuscript_file: z.string().optional(),
        v1_id: z.string().optional(),
        cut_log: z
          .array(z.object({ item: z.string(), chapter: z.string(), reason: z.string() }).strict())
          .optional(),
        notes: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type WorkbookV3 = z.infer<typeof WorkbookV3>;
export type WorkbookV3Input = z.input<typeof WorkbookV3>;

/** Keys a reader must never receive. Strip before serving. */
export const INTERNAL_KEYS = ["internal"] as const;

export function stripInternal<T extends { internal?: unknown }>(doc: T): Omit<T, "internal"> {
  const { internal: _internal, ...rest } = doc;
  return rest;
}

export function isWellbeing(doc: Pick<WorkbookV3, "safety_tier">): boolean {
  return doc.safety_tier !== "none";
}
