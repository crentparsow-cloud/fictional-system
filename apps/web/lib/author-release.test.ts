import { describe, expect, it, vi } from "vitest";
import { contentHash } from "@akana/schema";
import focus from "../../../content/workbooks/v3/focus.json";
import {
  EDITOR_MAX_BYTES,
  RELEASE_NOTICES,
  SHARE_ESTIMATE_INPUTS,
  authorStatus,
  isContentHash,
  ladderOptions,
  parseEditorJson,
  parsePriceChoice,
  parseStudioSignoff,
  previewDoc,
  prettyJson,
  releaseErrorNotice,
  schemaHints,
  shareEstimate,
  starterDocument,
  studioSignoffKinds,
} from "./author-release";
import { STUDIO_HELP_TOPICS, listStudioHelpPages } from "./studio-help";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({}) }));

const V = "a2000000-0000-0000-0000-0000000000d1";
const W = "a2000000-0000-0000-0000-0000000000c1";
const H = "a".repeat(64);
const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("preview (F-038)", () => {
  it("builds the reader document with the internal block stripped", () => {
    const doc = previewDoc({ ...focus, internal: { notes: "house only" } });
    expect(doc.ok).toBe(true);
    if (doc.ok) expect((doc.workbook as Record<string, unknown>).internal).toBeUndefined();
  });

  it("refuses a document that does not fit the schema", () => {
    expect(previewDoc({ title: "half a workbook" })).toEqual({ ok: false, reason: "schema" });
    expect(previewDoc(null)).toEqual({ ok: false, reason: "schema" });
    expect(previewDoc([1, 2])).toEqual({ ok: false, reason: "schema" });
  });
});

describe("sign-off (F-039)", () => {
  it("offers author to writers and publisher to publisher owners and editors only", () => {
    expect(studioSignoffKinds("author", "publisher")).toEqual(["author"]);
    expect(studioSignoffKinds("owner", "publisher")).toEqual(["author", "publisher"]);
    expect(studioSignoffKinds("editor", "author_company")).toEqual(["author", "publisher"]);
    expect(studioSignoffKinds("owner", "individual")).toEqual(["author"]);
    expect(studioSignoffKinds("finance", "publisher")).toEqual([]);
    expect(studioSignoffKinds("viewer", "publisher")).toEqual([]);
  });

  it("needs the version, the exact hash, the confirm box and a name", () => {
    const ok = { version: V, content_hash: H, kind: "author", confirm: "yes", signer_name: "  Ann Author ", note: "" };
    const r = parseStudioSignoff(form(ok));
    expect(r).toEqual({ ok: true, value: { versionId: V, contentHash: H, kind: "author", signerName: "Ann Author", note: null } });
    expect(parseStudioSignoff(form({ ...ok, confirm: "" }))).toEqual({ ok: false, field: "confirm" });
    expect(parseStudioSignoff(form({ ...ok, content_hash: "abc" }))).toEqual({ ok: false, field: "content_hash" });
    expect(parseStudioSignoff(form({ ...ok, kind: "editor" }))).toEqual({ ok: false, field: "kind" });
    expect(parseStudioSignoff(form({ ...ok, signer_name: "<b>" }))).toEqual({ ok: false, field: "signer_name" });
    expect(parseStudioSignoff(form({ ...ok, version: "nope" }))).toEqual({ ok: false, field: "version" });
    expect(isContentHash(H)).toBe(true);
    expect(isContentHash(H.toUpperCase())).toBe(false);
  });

  it("maps a changed hash to its own notice", () => {
    expect(releaseErrorNotice("AKR02")).toBe("changed");
    expect(releaseErrorNotice("AKS01")).toBe("denied");
    expect(releaseErrorNotice("AKS29")).toBe("rate-limited");
    expect(releaseErrorNotice(undefined)).toBe("failed");
    for (const n of Object.values(RELEASE_NOTICES)) expect(n.text).not.toMatch(/—/);
  });

  it("describes every status in plain words", () => {
    expect(authorStatus("approved").line).toMatch(/not on sale yet/);
    expect(authorStatus("author_sign_off").label).toBe("In review");
  });
});

describe("pricing (F-040)", () => {
  it("lists the six workbook points and says when a figure is not set", () => {
    const opts = ladderOptions();
    expect(opts.map((o) => o.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(opts.every((o) => o.gbp === null)).toBe(true);
    const withFigure = ladderOptions([{ id: "p2", kind: "workbook", label: "x", amounts: { GBP: 999 }, stripePriceId: null, active: false }]);
    expect(withFigure[1]!.gbp).toBe("£9.99");
  });

  it("reads the price form", () => {
    expect(parsePriceChoice(form({ workbook: W, price_point: "p3", in_membership: "yes" }))).toEqual({ ok: true, value: { workbookId: W, point: "p3", inMembership: true } });
    expect(parsePriceChoice(form({ workbook: W, price_point: "p3" }))).toEqual({ ok: true, value: { workbookId: W, point: "p3", inMembership: false } });
    expect(parsePriceChoice(form({ workbook: W, price_point: "member_month" }))).toEqual({ ok: false });
  });

  it("shows no share estimate while any input is a placeholder", () => {
    expect(Object.values(SHARE_ESTIMATE_INPUTS).every((v) => v === null)).toBe(true);
    expect(shareEstimate(999)).toBeNull();
  });

  it("works the estimate out when every input is set", () => {
    // Test inputs only, not Akana's figures: 50% share, 20% VAT, 2% plus 20p fee.
    const inputs = { singleSaleShare: 0.5, vatRate: 0.2, paymentFeeRate: 0.02, paymentFeeFixedMinor: 20 };
    // 1200 gross: 1000 ex VAT, fee 24 + 20 = 44, 956 net, half is 478.
    expect(shareEstimate(1200, inputs)).toBe(478);
    expect(shareEstimate(0, inputs)).toBeNull();
    expect(shareEstimate(1200, { ...inputs, singleSaleShare: 1.5 })).toBeNull();
  });
});

describe("JSON editor (F-086)", () => {
  it("parses one object and says where it breaks", () => {
    expect(parseEditorJson('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseEditorJson("[1]")).toMatchObject({ ok: false });
    expect(parseEditorJson("   ")).toMatchObject({ ok: false });
    const bad = parseEditorJson('{\n  "a": 1,\n  "b": }');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/parse/);
    expect(parseEditorJson(`{"a":"${"x".repeat(EDITOR_MAX_BYTES)}"}`)).toMatchObject({ ok: false });
  });

  it("keeps the content hash stable through the editor round trip", () => {
    const text = prettyJson(focus);
    const parsed = parseEditorJson(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(contentHash(parsed.value)).toBe(contentHash(focus));
  });

  it("takes the schema hints from the schema", () => {
    const hints = schemaHints();
    expect(hints.find((h) => h.key === "code")?.required).toBe(true);
    expect(hints.find((h) => h.key === "internal")?.required).toBe(false);
  });

  it("starts a first version with the workbook's identity", () => {
    const d = starterDocument({ code: "AK-T20C0", slug: "wb", title: "T", card_line: "", genre_id: "productivity", safety_tier: "none", depth: "full", badge: "official", is_demo: false });
    expect(d.code).toBe("AK-T20C0");
    expect(d.schema_version).toBe("3.0");
  });
});

describe("author help pages (F-044)", () => {
  it("renders every topic with a title, a summary and no em dashes", () => {
    const pages = listStudioHelpPages();
    expect(pages.map((p) => p.slug)).toEqual([...STUDIO_HELP_TOPICS]);
    for (const p of pages) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.summary.length).toBeGreaterThan(10);
      expect(p.html).not.toMatch(/—|–/);
    }
  });

  it("says plainly what is not decided", () => {
    const pages = Object.fromEntries(listStudioHelpPages().map((p) => [p.slug, p.html]));
    expect(pages.pricing).toMatch(/not set yet/);
    expect(pages.pool).toMatch(/not decided/);
  });
});

describe("author status mail (F-043)", () => {
  it("links each email to the workbook in the Studio and the live page to the slug", async () => {
    const { authorStatusProps } = await import("./author-mail");
    const w = { id: W, title: "Steady", slug: "steady" };
    const live = authorStatusProps("live", w, "https://akana.test", "help@akana.test", "Ann") as { liveUrl: string; studioUrl: string };
    expect(live.liveUrl).toBe("https://akana.test/w/steady");
    expect(live.studioUrl).toBe(`https://akana.test/studio/workbooks/${W}`);
    const ch = authorStatusProps("changes_requested", w, "https://akana.test", "", undefined, { notes: [] }) as { notes: string[] };
    expect(ch.notes.length).toBe(1);
  });
});
