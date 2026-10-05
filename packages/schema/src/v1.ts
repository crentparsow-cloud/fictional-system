/**
 * Minimal TypeScript shape of a v1.0 workbook (content/schema/workbook.v1.schema.json).
 * Used only by the v1 to v3 migration. The JSON Schema file stays the source of
 * truth for v1 structure; the Python validator still checks it in CI.
 */

export interface V1Field {
  id: string;
  type: string;
  label: string;
  help?: string;
  options?: string[];
  columns?: string[];
  rows?: string[];
  min_items?: number;
  max_items?: number;
  optional?: boolean;
}

export interface V1Step {
  text: string;
  figure?: string;
}

export interface V1Exercise {
  id: string;
  title: string;
  purpose: string;
  why: string;
  source: { chapter: string; note?: string };
  minutes: number;
  steps: V1Step[];
  example: { character: string; text: string };
  fields: V1Field[];
  reflect?: string;
  feeds_plan?: { field_id: string; plan_section: string }[];
  short_version: { minutes: number; steps: V1Step[]; field_ids: string[] };
  done_when: string;
  repeat_weeks?: number[];
  toolkit_link?: string;
  stuck_alternative?: string;
  safety_link?: boolean;
  community?: boolean;
  together?: string;
}

export interface V1Workbook {
  schema_version: "1.0";
  id: string;
  status?: string;
  topic_name: string;
  tagline: string;
  set_id: string;
  safety_tier: "standard" | "higher";
  source_book: { title: string; author: string; manuscript_file: string };
  start: {
    welcome: string;
    how_it_works: string[];
    why_prompt: string;
    higher_tier_note?: string;
    extra_safety_note?: string;
  };
  selfcheck: {
    intro: string;
    scale_labels: string[];
    areas: { id: string; label: string }[];
    items: { id: string; area: string; text: string; reverse_scored?: boolean; safety_item?: boolean }[];
    result_note: string;
  };
  checkin: { fields: V1Field[]; short_field_ids: string[] };
  daily_check: { question: string; scale_low: string; scale_high: string; tags: string[] };
  stages: {
    id: string;
    number: number;
    name: string;
    weeks: number[];
    primer: { title: string; body: string; figure: string };
    outcome: string;
    review_question: string;
  }[];
  weeks: {
    number: number;
    stage: string;
    focus: string;
    exercise_ids: string[];
    new_toolkit_ids?: string[];
    selfcheck?: boolean;
    repeat_ids?: string[];
  }[];
  exercises: V1Exercise[];
  toolkit: {
    id: string;
    title: string;
    when_to_use: string;
    steps: string[];
    minutes: number;
    figure: string;
    source: { chapter: string; note?: string };
    safety_link?: boolean;
    together?: string;
  }[];
  milestones: { id: string; trigger: string; message: string }[];
  plan_sections: { id: string; title: string }[];
  finish: { summary: string; book_bridge: string; related_ids?: string[] };
  keep_going: { monthly_questions: string[]; refresher_ids: string[] };
  cut_log?: { item: string; chapter: string; reason: string }[];
  safety_hub?: {
    intro?: string;
    points: { title: string; text: string }[];
    see_doctor: string[];
    emergency?: string[];
  };
}
