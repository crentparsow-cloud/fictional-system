import { describe, expect, it, vi } from "vitest";
import { contentHash } from "@akana/schema";
import focus from "../../../content/workbooks/v3/focus.json";
import {
  EDITOR_MAX_BYTES,
  RELEASE_NOTICES,
  estimateVatRate,
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
  it("lists the six workbook points with their GBP figures, and says when a figure is not set", () => {
    const opts = ladderOptions();
    expect(opts.map((o) => o.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(opts.map((o) => o.gbp)).toEqual(["£7.99", "£8.99", "£9.99", "£11.99", "£12.99", "£14.99"]);
    expect(ladderOptions([{ id: "p1", kind: "workbook", label: "x", amounts: {}, stripePriceId: null, active: false }])[0]!.gbp).toBeNull();
    const withFigure = ladderOptions([{ id: "p2", kind: "workbook", label: "x", amounts: { GBP: 999 }, stripePriceId: null, active: false }]);
    expect(withFigure[1]!.gbp).toBe("£9.99");
  });

  it("reads the price form", () => {
    expect(parsePriceChoice(form({ workbook: W, price_point: "p3", in_membership: "yes" }))).toEqual({ ok: true, value: { workbookId: W, point: "p3", inMembership: true } });
    expect(parsePriceChoice(form({ workbook: W, price_point: "p3" }))).toEqual({ ok: true, value: { workbookId: W, point: "p3", inMembership: false } });
    expect(parsePriceChoice(form({ workbook: W, price_point: "member_month" }))).toEqual({ ok: false });
  });

  it("works the estimate out as share x (price - VAT - card fee), rounded to the penny", () => {
    // 20% VAT, 1.5% + 20p card fee. Each case worked by hand in pence.
    // 799: VAT 133.17, fee 31.99, net 633.85. 999: VAT 166.50, fee 34.99, net 797.51. 1499: VAT 249.83, fee 42.49, net 1206.68.
    const cases: [number, number, number][] = [
      [799, 0.8, 507],
      [799, 0.65, 412],
      [999, 0.8, 638],
      [999, 0.65, 518],
      [1499, 0.8, 965],
      [1499, 0.65, 784],
    ];
    for (const [gross, rate, want] of cases) expect(shareEstimate(gross, rate, 0.2)).toBe(want);
  });

  it("never goes negative and never guesses", () => {
    expect(shareEstimate(10, 0.8, 0.2)).toBe(0);
    expect(shareEstimate(0, 0.8, 0.2)).toBeNull();
    expect(shareEstimate(799.5, 0.8, 0.2)).toBeNull();
    expect(shareEstimate(null, 0.8, 0.2)).toBeNull();
    expect(shareEstimate(799, 1.5, 0.2)).toBeNull();
    expect(shareEstimate(799, 0.8, 1)).toBeNull();
  });

  it("reads the VAT rate from ESTIMATE_VAT_RATE and falls back to 0.20", () => {
    expect(estimateVatRate({})).toBe(0.2);
    expect(estimateVatRate({ ESTIMATE_VAT_RATE: "" })).toBe(0.2);
    expect(estimateVatRate({ ESTIMATE_VAT_RATE: "0" })).toBe(0);
    expect(estimateVatRate({ ESTIMATE_VAT_RATE: "0.05" })).toBe(0.05);
    expect(estimateVatRate({ ESTIMATE_VAT_RATE: "20" })).toBe(0.2);
    expect(estimateVatRate({ ESTIMATE_VAT_RATE: "abc" })).toBe(0.2);
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
