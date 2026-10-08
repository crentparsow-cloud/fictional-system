/**
 * Review queue and release gate helpers for /admin/review (F-084, F-085,
 * F-155). Pure: no Next, no Supabase. The database decides; these only shape
 * what the pages show and read the forms.
 */
import { validateWorkbook, type Finding } from "@akana/validate";

// ---------------------------------------------------------------------------
// Which workbooks are in the queue
// ---------------------------------------------------------------------------

/**
 * Statuses that are not review. Anything else is treated as in the queue, so
 * a status added later for author submission (submitted, editorial and so
 * on) shows up here without a code change.
 */
export const OUT_OF_QUEUE = ["draft", "live", "paused", "retired"] as const;

export function inReviewQueue(status: string): boolean {
  return !(OUT_OF_QUEUE as readonly string[]).includes(status);
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In review",
  editorial: "Editorial",
  safety_review: "Safety review",
  clinical_sign_off: "Clinical sign-off",
  author_sign_off: "Author sign-off",
  approved: "Approved",
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  retired: "Retired",
};

/** A label for any status, including ones this file has never seen. */
export function reviewStatusLabel(status: string): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  const words = status.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}

export interface QueueWorkbook {
  id: string;
  code: string;
  title: string;
  status: string;
  safety_tier: string;
  genre_id: string;
  current_version_id: string | null;
}

export interface QueueVersion {
  id: string;
  workbook_id: string;
  semver: string;
  content_hash: string;
  created_at: string;
  published_at: string | null;
  validated_at: string | null;
}

/**
 * The version under review for a workbook: the newest unpublished one, or
 * the current one when every version is published.
 */
export function versionUnderReview(w: Pick<QueueWorkbook, "id" | "current_version_id">, versions: readonly QueueVersion[]): QueueVersion | null {
  const mine = versions.filter((v) => v.workbook_id === w.id);
  const unpublished = mine.filter((v) => !v.published_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (unpublished[0]) return unpublished[0];
  return mine.find((v) => v.id === w.current_version_id) ?? null;
}

/** Whole days between two instants, never negative. */
export function ageInDays(fromIso: string, now: Date = new Date()): number {
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function ageLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ---------------------------------------------------------------------------
// The validator, run on the server against the version JSON
// ---------------------------------------------------------------------------

export interface ValidatorSummary {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  /** True when the validator itself threw: a fault to alert on (F-142), not a content finding. */
  crashed?: boolean;
}

/** Runs @akana/validate at full strength: the gate never uses the lenient mode. */
export function runValidator(content: unknown): ValidatorSummary {
  try {
    const r = validateWorkbook(content);
    return { ok: r.ok, errors: r.errors, warnings: r.warnings };
  } catch {
    return {
      ok: false,
      errors: [{ severity: "error", category: "schema", path: "", message: "The validator could not read this version." }],
      warnings: [],
      crashed: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Release requirements and sign-offs
// ---------------------------------------------------------------------------

export const REQUIREMENT_LABELS: Record<string, string> = {
  validator: "Passed the validator",
  editor: "Editor sign-off",
  author_or_publisher: "Author or publisher sign-off",
  safety: "Safety reviewer sign-off",
  clinician: "Named clinician sign-off",
  theological: "Theological reviewer sign-off",
  licence: "Licence or public-domain record",
};

export function requirementLabel(r: string): string {
  return REQUIREMENT_LABELS[r] ?? r;
}

export interface Requirement {
  requirement: string;
  required: boolean;
  met: boolean;
}

/** The requirements that block release, in a fixed order. */
export function unmetRequirements(rows: readonly Requirement[]): string[] {
  const order = Object.keys(REQUIREMENT_LABELS);
  return rows
    .filter((r) => r.required && !r.met)
    .map((r) => r.requirement)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export const SIGNOFF_KINDS = ["editor", "author", "publisher", "safety", "clinician", "theological"] as const;
export type SignoffKind = (typeof SIGNOFF_KINDS)[number];

export const SIGNOFF_LABELS: Record<SignoffKind, string> = {
  editor: "Editor",
  author: "Author",
  publisher: "Publisher",
  safety: "Safety reviewer",
  clinician: "Clinician",
  theological: "Theological reviewer",
};

export const REVIEWER_TRADITIONS = ["protestant", "catholic", "orthodox", "anglican", "general_christian"] as const;
export const TRADITION_LABELS = ["protestant", "catholic", "orthodox", "general_christian"] as const;
export type ReviewerTradition = (typeof REVIEWER_TRADITIONS)[number];
export type TraditionLabel = (typeof TRADITION_LABELS)[number];

export const TRADITION_NAMES: Record<ReviewerTradition, string> = {
  protestant: "Protestant",
  catholic: "Catholic",
  orthodox: "Orthodox",
  anglican: "Anglican",
  general_christian: "General Christian",
};

/** The reader-facing tradition line the reviewer approves (F-155). */
export function traditionLine(label: TraditionLabel): string {
  return `Written from within the ${TRADITION_NAMES[label]} tradition. Readers from other churches are welcome.`;
}

/** Whether a reviewer from this tradition may approve this label. Mirrors public.record_signoff. */
export function reviewerMayApprove(reviewer: ReviewerTradition, label: TraditionLabel): boolean {
  return label === "general_christian" || reviewer === label;
}

/**
 * The sign-off kinds a role may record. Mirrors public.record_signoff:
 * editor, clinician, theological, author and publisher for owners and
 * editors; safety for safety reviewers only.
 */
export function signoffKindsFor(roles: readonly string[]): SignoffKind[] {
  const staffEditor = roles.includes("owner") || roles.includes("editor");
  const safety = roles.includes("safety_reviewer");
  return SIGNOFF_KINDS.filter((k) => (k === "safety" ? safety : staffEditor));
}

export type SignoffInput = {
  kind: SignoffKind;
  signerName: string;
  reviewerTradition: ReviewerTradition | null;
  traditionLabel: TraditionLabel | null;
  note: string | null;
};

const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Read a sign-off form. Returns a field name on error, so the page can say which. */
export function parseSignoff(get: (name: string) => unknown): { ok: true; value: SignoffInput } | { ok: false; field: string } {
  const kind = get("kind");
  if (!isIn(SIGNOFF_KINDS, kind)) return { ok: false, field: "kind" };
  const name = typeof get("signer_name") === "string" ? (get("signer_name") as string).trim() : "";
  if (!name || name.length > 200) return { ok: false, field: "signer_name" };
  const noteRaw = typeof get("note") === "string" ? (get("note") as string).trim() : "";
  if (noteRaw.length > 500) return { ok: false, field: "note" };
  let reviewerTradition: ReviewerTradition | null = null;
  let traditionLabel: TraditionLabel | null = null;
  if (kind === "theological") {
    const rt = get("reviewer_tradition");
    const tl = get("tradition_label");
    if (!isIn(REVIEWER_TRADITIONS, rt)) return { ok: false, field: "reviewer_tradition" };
    if (!isIn(TRADITION_LABELS, tl)) return { ok: false, field: "tradition_label" };
    if (!reviewerMayApprove(rt, tl)) return { ok: false, field: "tradition_match" };
    reviewerTradition = rt;
    traditionLabel = tl;
  }
  return { ok: true, value: { kind, signerName: name, reviewerTradition, traditionLabel, note: noteRaw || null } };
}

/** A required free-text reason, trimmed and capped. */
export function parseReason(raw: unknown, max: number): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return v && v.length <= max ? v : null;
}

/** How a refusal from the 0016 functions maps to a fixed notice code. */
export function reviewErrorNotice(code: string | null | undefined): string {
  switch (code) {
    case "42501":
      return "denied";
    case "AKR01":
      return "gate_refused";
    case "AKR02":
      return "gate_changed";
    case "AKR03":
      return "override_same_person";
    case "AKS08": // 0013: the book has no active licence
      return "licence_inactive";
    case "55000":
      return "stale";
    case "23514":
      return "review_invalid";
    case "P0002":
    case "22023":
      return "invalid";
    default:
      return "failed";
  }
}

/** Short hash for display. */
export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 12) : "";
}
