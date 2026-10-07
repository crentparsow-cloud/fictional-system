import { WorkbookV3, type WorkbookV3Input } from "@akana/schema";

/**
 * Test-only finance demo workbook (F-113). It exercises all four v3 field
 * types in one place. It is not catalogue content and is never published:
 * the content files stay untouched.
 */
export const financeDemoInput: WorkbookV3Input = {
  schema_version: "3.0",
  code: "AK-TFX3K",
  slug: "a-month-on-one-page-tfx3k",
  title: "A Month on One Page",
  card_line: "See where a month of money goes and weigh one choice with care.",
  book: { book_id: "a-month-on-one-page", title: "A Month on One Page" },
  author: { author_id: "AU-7KQ2M", display_name: "Test Author" },
  genre: "finance",
  language: "en",
  spelling: "en-GB",
  is_demo: true,
  depth: "first_unit",
  badge: "demo",
  safety_tier: "none",
  advice_guardrail: "money_guidance_not_advice",
  structure: { unit: "week", count: 2, free_units: 1 },
  start: {
    welcome: "Two short weeks. One page for your month, one choice weighed with care.",
    how_it_works: ["Open the week.", "Fill in the figures you know.", "Leave blanks for the ones you do not."],
    why_prompt: "What would one clear page of your month change for you?",
  },
  units: [
    { number: 1, focus: "Money in and money out.", exercise_ids: ["month_map"] },
    { number: 2, focus: "Weigh one choice.", exercise_ids: ["weigh_choice"] },
  ],
  exercises: [
    {
      id: "month_map",
      title: "Map your month",
      purpose: "One page with what comes in, what goes out and what is left.",
      why: "A figure written down is easier to work with than one held in your head.",
      source: { chapter: "1" },
      minutes: 15,
      steps: [{ text: "Write your take-home pay." }, { text: "List what goes out each month." }, { text: "Note how many months of costs you hold in savings." }],
      fields: [
        { id: "take_home", type: "currency", label: "Take-home pay this month", unit: "GBP", min: 0 },
        {
          id: "outgoings",
          type: "table",
          label: "What goes out each month",
          columns: ["Item", "Amount"],
          computed: "sum",
          unit: "GBP",
          min: 0,
          min_items: 2,
          max_items: 12,
        },
        { id: "buffer_months", type: "number", label: "Months of costs in savings", unit: "months", min: 0, max: 24, step: 1, optional: true },
      ],
      done_when: "Your month fits on one page.",
    },
    {
      id: "weigh_choice",
      title: "Weigh one choice",
      purpose: "Compare two or three options against what matters to you.",
      why: "Scoring each option on the same few points slows a choice down in a good way.",
      source: { chapter: "2" },
      minutes: 15,
      steps: [{ text: "Name the options." }, { text: "Say how much each point matters." }, { text: "Score each option." }],
      fields: [
        {
          id: "choice",
          type: "decision_matrix",
          label: "Your options",
          columns: ["Cost each month", "Flexibility", "Peace of mind"],
          computed: "weighted_sum",
          min_items: 2,
          max_items: 4,
        },
        { id: "monthly_costs", type: "currency", label: "Your monthly costs, from week 1", unit: "GBP", prefill_from: "outgoings", optional: true },
        { id: "next_step", type: "short_text", label: "One step this week" },
      ],
      done_when: "You know which option scores highest and what you will do next.",
    },
  ],
  finish: { summary: "A month on one page and one choice weighed.", book_bridge: "The book goes on to building the buffer." },
};

export const financeDemo = WorkbookV3.parse(financeDemoInput);
