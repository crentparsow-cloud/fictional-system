/**
 * Author release helpers (M5): preview (F-038), author sign-off against a
 * content hash (F-039), pricing from the ladder (F-040) and the staff JSON
 * editor (F-086). Pure: no Next, no Supabase, so pages, actions and tests
 * share one answer. Migration 0020 enforces every rule again.
 */
import { WorkbookV3, stripInternal } from "@akana/schema";
import { PRICE_LADDER, isPlaceholder, type PricePoint, type WorkbookPricePointId } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Ids and hashes
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

const HASH = /^[0-9a-f]{64}$/;
export function isContentHash(v: unknown): v is string {
  return typeof v === "string" && HASH.test(v);
}

/** The first 12 characters, which is what people compare by eye. */
export function shortHash(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 12) : "";
}

// ---------------------------------------------------------------------------
// Preview (F-038)
// ---------------------------------------------------------------------------

export type PreviewDoc = { ok: true; workbook: WorkbookV3 } | { ok: false; reason: "schema" };

/**
 * The version JSON as the reader engine takes it: the internal block
 * stripped and the schema applied, exactly as publishing would serve it. A
 * version that does not fit the schema cannot be previewed; the page says so
 * rather than rendering something a reader would never see.
 */
export function previewDoc(content: unknown): PreviewDoc {
  if (!content || typeof content !== "object" || Array.isArray(content)) return { ok: false, reason: "schema" };
  const parsed = WorkbookV3.safeParse(stripInternal(content as { internal?: unknown }));
  return parsed.success ? { ok: true, workbook: parsed.data } : { ok: false, reason: "schema" };
}

// ---------------------------------------------------------------------------
// Sign-off (F-039)
// ---------------------------------------------------------------------------

export type StudioSignoffKind = "author" | "publisher";

export const STUDIO_SIGNOFF_LABELS: Record<StudioSignoffKind, string> = {
  author: "Sign off as the author",
  publisher: "Sign off as the publisher",
};

/** Mirrors app.author_signoff (0020): who may give which kind. */
export function studioSignoffKinds(role: string | null | undefined, orgKind: string | null | undefined): StudioSignoffKind[] {
  const out: StudioSignoffKind[] = [];
  if (role === "owner" || role === "editor" || role === "author") out.push("author");
  if ((role === "owner" || role === "editor") && (orgKind === "publisher" || orgKind === "author_company")) out.push("publisher");
  return out;
}

export interface StudioSignoffInput {
  versionId: string;
  contentHash: string;
  kind: StudioSignoffKind;
  signerName: string;
  note: string | null;
}

const clean = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, max)
        .trim()
    : "";

/** Reads the sign-off form. The confirm box must be ticked. */
export function parseStudioSignoff(get: (name: string) => unknown): { ok: true; value: StudioSignoffInput } | { ok: false; field: string } {
  const versionId = get("version");
  if (!isUuid(versionId)) return { ok: false, field: "version" };
  const contentHash = get("content_hash");
  if (!isContentHash(contentHash)) return { ok: false, field: "content_hash" };
  const kind = get("kind");
  if (kind !== "author" && kind !== "publisher") return { ok: false, field: "kind" };
  if (get("confirm") !== "yes") return { ok: false, field: "confirm" };
  const signerName = clean(get("signer_name"), 200);
  if (signerName.length < 2 || /[<>]/.test(signerName)) return { ok: false, field: "signer_name" };
  const note = clean(get("note"), 500);
  if (/[<>]/.test(note)) return { ok: false, field: "note" };
  return { ok: true, value: { versionId, contentHash, kind, signerName, note: note || null } };
}

/** Plain words for the release requirements, as an author reads them. */
export const AUTHOR_REQUIREMENT_LABELS: Record<string, string> = {
  validator: "Passes Akana's automatic checks",
  editor: "Signed off by an Akana editor",
  author_or_publisher: "Signed off by you (author or publisher)",
  safety: "Signed off by a safety reviewer",
  clinician: "Signed off by a named clinician",
  theological: "Signed off by a theological reviewer",
  licence: "An active licence for the book",
};

export function authorRequirementLabel(r: string): string {
  return AUTHOR_REQUIREMENT_LABELS[r] ?? r;
}

/** Where a workbook is, in the author's words. Unknown statuses read as "In review". */
export function authorStatus(status: string): { label: string; line: string } {
  switch (status) {
    case "draft":
      return { label: "Draft", line: "Not yet in review. Akana builds the first version from your submission." };
    case "approved":
      return { label: "Approved", line: "Every sign-off is in. It is not on sale yet." };
    case "live":
      return { label: "Live", line: "Readers can find it in the Library." };
    case "paused":
      return { label: "Paused", line: "Hidden from new readers for now. Readers who have it keep their access." };
    case "retired":
      return { label: "Retired", line: "No longer sold." };
    default:
      return { label: "In review", line: "Akana is checking structure, house style and the claims rules for its genre." };
  }
}

// ---------------------------------------------------------------------------
// Pricing from the ladder (F-040)
// ---------------------------------------------------------------------------

export const WORKBOOK_POINT_IDS: readonly WorkbookPricePointId[] = ["p1", "p2", "p3", "p4", "p5", "p6"];

export function isWorkbookPointId(v: unknown): v is WorkbookPricePointId {
  return typeof v === "string" && (WORKBOOK_POINT_IDS as readonly string[]).includes(v);
}

export interface LadderOption {
  id: WorkbookPricePointId;
  label: string;
  /** "£9.99" style, or null while the point is a placeholder. */
  gbp: string | null;
}

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** The six workbook points, with the GBP figure when one is set. */
export function ladderOptions(points: readonly PricePoint[] = Object.values(PRICE_LADDER)): LadderOption[] {
  return WORKBOOK_POINT_IDS.map((id) => {
    const p = points.find((x) => x.id === id) ?? PRICE_LADDER[id];
    const minor = isPlaceholder(p) ? undefined : p.amounts.GBP;
    return { id, label: PRICE_LADDER[id].label, gbp: typeof minor === "number" ? gbp.format(minor / 100) : null };
  });
}

export function parsePriceChoice(get: (name: string) => unknown): { ok: true; value: { workbookId: string; point: WorkbookPricePointId; inMembership: boolean } } | { ok: false } {
  const workbookId = get("workbook");
  const point = get("price_point");
  if (!isUuid(workbookId) || !isWorkbookPointId(point)) return { ok: false };
  return { ok: true, value: { workbookId, point, inMembership: get("in_membership") === "yes" } };
}

/**
 * PLACEHOLDER. The inputs to the author's share estimate. Each is null until
 * Crent sets it (questions C4, D2 and D3, and the accountant on VAT for an
 * interactive workbook). While any is null the Studio says the estimate is
 * not available, rather than showing an invented figure.
 */
export const SHARE_ESTIMATE_INPUTS: Readonly<{ singleSaleShare: number | null; vatRate: number | null; paymentFeeRate: number | null; paymentFeeFixedMinor: number | null }> =
  Object.freeze({ singleSaleShare: null, vatRate: null, paymentFeeRate: null, paymentFeeFixedMinor: null });

/**
 * The author's share of one single sale, in minor units, net of VAT and
 * payment fees: gross less the VAT inside it, less the fee, times the share.
 * Null when any input is missing, so nothing is ever guessed.
 */
export function shareEstimate(
  grossMinor: number | null | undefined,
  inputs: { singleSaleShare: number | null; vatRate: number | null; paymentFeeRate: number | null; paymentFeeFixedMinor: number | null } = SHARE_ESTIMATE_INPUTS,
): number | null {
  const { singleSaleShare, vatRate, paymentFeeRate, paymentFeeFixedMinor } = inputs;
  if (typeof grossMinor !== "number" || !Number.isInteger(grossMinor) || grossMinor <= 0) return null;
  if (singleSaleShare === null || vatRate === null || paymentFeeRate === null || paymentFeeFixedMinor === null) return null;
  if (singleSaleShare < 0 || singleSaleShare > 1 || vatRate < 0 || paymentFeeRate < 0 || paymentFeeFixedMinor < 0) return null;
  const exVat = grossMinor / (1 + vatRate);
  const fee = grossMinor * paymentFeeRate + paymentFeeFixedMinor;
  return Math.max(0, Math.floor((exVat - fee) * singleSaleShare));
}

export const PRICE_CHOICE_LABELS: Record<string, string> = {
  pending: "Waiting for Akana",
  approved: "Approved",
  declined: "Not approved",
};

// ---------------------------------------------------------------------------
// Notices for the Studio workbook pages. Fixed codes, never free text.
// ---------------------------------------------------------------------------

export const RELEASE_NOTICES = {
  signed: { tone: "ok", text: "Sign-off recorded against this exact version." },
  "price-sent": { tone: "ok", text: "Price choice sent. Akana approves it with the workbook." },
  changed: { tone: "error", text: "The workbook changed since this page loaded. Look at the new version before you sign." },
  confirm: { tone: "error", text: "Please tick the box to confirm you have previewed this version." },
  name: { tone: "error", text: "Please type your name as you want it on the record." },
  closed: { tone: "error", text: "This version cannot be signed or priced now." },
  "rate-limited": { tone: "error", text: "That's the limit for today. Please try again tomorrow." },
  invalid: { tone: "error", text: "Please check the form. Nothing changed." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  failed: { tone: "error", text: "That didn't work just now. Nothing changed. Please try again." },
} as const;
export type ReleaseNotice = keyof typeof RELEASE_NOTICES;

export function releaseNotice(code: string | string[] | undefined): { tone: "ok" | "error"; text: string } | null {
  const c = Array.isArray(code) ? code[0] : code;
  return c && c in RELEASE_NOTICES ? RELEASE_NOTICES[c as ReleaseNotice] : null;
}

/** Maps a 0020 error code to a notice. */
export function releaseErrorNotice(code: string | undefined): ReleaseNotice {
  switch (code) {
    case "AKR02":
      return "changed";
    case "AKS01":
    case "42501":
      return "denied";
    case "AKS02":
    case "23514":
      return "invalid";
    case "AKS08":
      return "closed";
    case "AKS29":
      return "rate-limited";
    default:
      return "failed";
  }
}

// ---------------------------------------------------------------------------
// Staff JSON editor (F-086)
// ---------------------------------------------------------------------------

/**
 * Under the 1 MB body limit of a Next server action. The database refuses
 * anything over 2 MB whatever the route (app.staff_save_version). The
 * largest workbook today is about 110 KB.
 */
export const EDITOR_MAX_BYTES = 900_000;

export type EditorParse = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

/** Parse the editor text. Only one JSON object is accepted. */
export function parseEditorJson(text: unknown): EditorParse {
  if (typeof text !== "string" || !text.trim()) return { ok: false, message: "The editor is empty." };
  if (new TextEncoder().encode(text).length > EDITOR_MAX_BYTES) return { ok: false, message: "The JSON is over 900 KB, which is more than the editor takes." };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const pos = /position (\d+)/.exec(msg)?.[1];
    if (pos) {
      const before = text.slice(0, Number(pos));
      const line = before.split("\n").length;
      const col = before.length - before.lastIndexOf("\n");
      return { ok: false, message: `The JSON does not parse near line ${line}, column ${col}.` };
    }
    return { ok: false, message: "The JSON does not parse." };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, message: "The JSON must be one object, starting with {." };
  return { ok: true, value: v as Record<string, unknown> };
}

export function prettyJson(content: unknown): string {
  return JSON.stringify(content ?? {}, null, 2);
}

export interface SchemaHint {
  key: string;
  required: boolean;
}

/** The top-level fields of a v3 workbook, from the schema itself, so the hints cannot drift. */
export function schemaHints(): SchemaHint[] {
  const shape = WorkbookV3.shape as Record<string, { isOptional: () => boolean }>;
  return Object.keys(shape).map((key) => ({ key, required: !shape[key]!.isOptional() }));
}

/**
 * A starting document for a workbook with no version yet. It will not pass
 * the validator until the content is written; it saves typing the identity.
 */
export function starterDocument(w: { code: string; slug: string; title: string; card_line: string; genre_id: string; safety_tier: string; depth: string; badge: string; is_demo: boolean }): Record<string, unknown> {
  return {
    schema_version: "3.0",
    code: w.code,
    slug: w.slug,
    title: w.title,
    card_line: w.card_line,
    genre: w.genre_id,
    language: "en",
    spelling: "en-GB",
    is_demo: w.is_demo,
    depth: w.depth,
    badge: w.badge,
    safety_tier: w.safety_tier,
    structure: { unit: "week", count: 1, free_units: 1 },
    start: { welcome: "", how_it_works: ["", ""], why_prompt: "" },
    units: [],
    exercises: [],
    finish: { summary: "", book_bridge: "" },
  };
}

/** Admin notices for the editor. Kept here so the page and the tests agree. */
export const EDITOR_NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  version_saved: { tone: "ok", text: "Saved as a new version. Sign-offs on the old content do not carry over." },
  editor_errors: { tone: "error", text: "The validator found errors. Nothing was saved." },
  editor_unchanged: { tone: "error", text: "Nothing changed, so no new version was made." },
  editor_code: { tone: "error", text: "The code in the JSON must stay the workbook's own code." },
  editor_parse: { tone: "error", text: "The JSON does not parse. Nothing was saved." },
};
