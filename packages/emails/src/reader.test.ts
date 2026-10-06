import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { READER_TEMPLATES, type ReaderProps, type ReaderTemplateName, type Theme, assertNoTitleProps, renderReader, renderSigninTemplate, SIGNIN_TEMPLATES } from "./reader";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

type Catalog = { books: { title: string }[]; workbooks: { name: string }[]; topic_sets: { id: string; name: string }[] };
const catalog = JSON.parse(readFileSync(join(root, "content/catalog/catalog.json"), "utf8")) as Catalog;
const v3dir = join(root, "content/workbooks/v3");
const v3 = readdirSync(v3dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(v3dir, f), "utf8")) as { title: string; short_title?: string });

/**
 * Multi-word titles are matched anywhere, case-insensitive. Single-word titles
 * and short titles are plain words ("Enough", "Sleep"), so they match as whole
 * words with their own capitalisation.
 */
const allTitles = [...new Set([...catalog.books.map((b) => b.title), ...v3.map((w) => w.title), ...v3.map((w) => w.short_title ?? "")])].filter(Boolean);
const fullTitles = allTitles.filter((t) => /\s/.test(t));
const shortTitles = allTitles.filter((t) => !/\s/.test(t));

const GENRE_LABELS = ["Wellbeing", "Personal development", "Relationships", "Parenting", "Career", "Leadership", "Business", "Productivity", "Finance", "Education", "Life skills"];
const THEMES: Theme[] = [...catalog.topic_sets.map((t) => ({ id: t.id, name: t.name })), ...GENRE_LABELS.map((g) => ({ id: g.toLowerCase().replace(/\s+/g, "_"), name: g }))];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const findTitle = (text: string): string | null => {
  for (const t of fullTitles) if (new RegExp(escapeRe(t), "i").test(text)) return t;
  for (const t of shortTitles) if (new RegExp(`(^|[^A-Za-z-])${escapeRe(t)}(?![A-Za-z-])`).test(text)) return t;
  return null;
};

const base = (themeName: string) => ({
  name: "Sam",
  appUrl: "https://example.test/home",
  settingsUrl: "https://example.test/you",
  supportEmail: "support@example.test",
  themeName,
});
const stages = { stageLabels: ["Explore", "Build", "Practice", "Keep"], stageIndex: 1 };
const sample = (themeName: string): { [K in ReaderTemplateName]: ReaderProps[K] } => ({
  welcome: { ...base(themeName) },
  first_unit_finished: { ...base(themeName), firstUnitLabel: "Day one" },
  purchase_lifetime: { ...base(themeName), offerName: "a single workbook", price: "£14" },
  purchase_pass: { ...base(themeName), price: "£6", periodWords: "a month", nextDate: "6 November 2026" },
  renewal_notice: { ...base(themeName), renewDate: "6 October 2027", price: "£48" },
  pass_terms_reminder: { ...base(themeName), price: "£48", periodWords: "a year", nextDate: "6 October 2027" },
  pass_away: { ...base(themeName), price: "£6", nextDate: "6 November 2026" },
  payment_failed: { ...base(themeName), price: "£6" },
  cancellation: { ...base(themeName), cancelMode: "immediate", refundAmount: "£3.20", refundStatus: "pending" },
  account_deleted: { ...base(themeName), deletionDate: "13 October 2026", undoUrl: "https://example.test/undo" },
  export_code: { ...base(themeName), code: "483 920" },
  partner_accepted: { ...base(themeName), partnerName: "Jo" },
  passkey_added: { ...base(themeName), when: "6 October 2026 at 20:14", device: "iPhone, Safari" },
  password_changed: { ...base(themeName), when: "6 October 2026 at 20:14", device: "Mac, Chrome" },
  email_changed: { ...base(themeName), when: "6 October 2026 at 20:14", device: "Mac, Chrome", newEmail: "new@example.test" },
  history_downloaded: { ...base(themeName), when: "6 October 2026 at 20:14", device: "Mac, Chrome" },
  stage_complete: { ...base(themeName), ...stages },
  inactive_7: { ...base(themeName), nextStep: "The second exercise" },
  inactive_14: { ...base(themeName) },
  inactive_30: { ...base(themeName) },
  maintenance: { ...base(themeName) },
  crosssell_general: { ...base(themeName) },
  crosssell_personal: { ...base(themeName), suggestions: [{ themeName, line: "Small steps that build on what you already do." }] },
  new_workbook_available: { ...base(themeName), themeName, line: "Built from a book readers already trust." },
  partner_invite: { ...base(themeName), readerName: "Sam", partnerName: "Jo", shareLevel: 3, acceptUrl: "https://example.test/yes", declineUrl: "https://example.test/no" },
  partner_update: { ...base(themeName), readerName: "Sam", partnerName: "Jo", shareLevel: 3, ...stages, stageIndex: 3, note: "Thank you for asking." },
  partner_stopped: { ...base(themeName), readerName: "Sam", partnerName: "Jo" },
});

const links = { unsubscribe: "https://example.test/unsubscribe", oneClick: "https://example.test/api/unsubscribe", stop: "https://example.test/stop", report: "https://example.test/report" };
const names = Object.keys(READER_TEMPLATES) as ReaderTemplateName[];

describe("reader templates", () => {
  it("has titles to test against", () => {
    expect(fullTitles.length).toBeGreaterThan(10);
    expect(shortTitles.length).toBeGreaterThan(10);
  });

  it("uses no theme name that is itself a title", () => {
    for (const t of THEMES) expect(allTitles.some((x) => x.toLowerCase() === t.name.toLowerCase()), `theme ${t.name} is a title`).toBe(false);
  });

  it("never renders a workbook or book title, for any template and any theme", () => {
    for (const theme of THEMES) {
      const props = sample(theme.name);
      for (const name of names) {
        const r = renderReader(name, props[name], links, "Akana Ltd, 1 Example Street, Edinburgh");
        // The theme is allowed in bodies. Mask exact theme occurrences, then look for titles.
        const masked = [r.subject, r.text, r.html].join("\n").split(theme.name).join("[theme]");
        expect(findTitle(masked), `${name} with theme ${theme.name}`).toBeNull();
      }
    }
    for (const name of Object.keys(SIGNIN_TEMPLATES)) {
      const r = renderSigninTemplate(name);
      expect(findTitle([r.subject, r.text, r.html].join("\n"))).toBeNull();
    }
  });

  it("keeps subjects free of the theme, the title and any address", () => {
    for (const theme of THEMES) {
      const props = sample(theme.name);
      for (const name of names) {
        const r = renderReader(name, props[name], links);
        expect(r.subject.toLowerCase()).not.toContain(theme.name.toLowerCase());
        expect(r.subject).not.toMatch(/@/);
        expect(findTitle(r.subject)).toBeNull();
      }
    }
  });

  it("assumes no programme length", () => {
    const props = sample("Worry and Fear");
    for (const name of names) {
      const r = renderReader(name, props[name], links);
      expect(r.text.toLowerCase()).not.toMatch(/twelve[- ]weeks?|12[- ]weeks?/);
    }
    const five = renderReader("stage_complete", { ...base("Stress and Overload"), stageLabels: ["Notice", "Name", "Try", "Review", "Keep"], stageIndex: 2 }, links);
    expect(five.text).toContain("Stage 3 of 5 complete");
    expect(five.text).toContain("Next: Review");
  });

  it("refuses a title arriving under any likely prop name", () => {
    expect(() => assertNoTitleProps({ title: "Wired Differently" })).toThrow(/title/);
    expect(() => assertNoTitleProps({ workbook_title: "x" })).toThrow();
    expect(() => assertNoTitleProps({ bookName: "x" })).toThrow();
    expect(() => assertNoTitleProps({ themeName: "Focus and attention" })).not.toThrow();
    const bad = { ...base("Mood and Energy"), workbookTitle: "Finding Your Way Back" } as unknown as ReaderProps["welcome"];
    expect(() => renderReader("welcome", bad)).toThrow(/title/);
  });

  it("marks the footer kind and category for the mailer", () => {
    const props = sample("Mood and Energy");
    expect(renderReader("welcome", props.welcome).category).toBe("transactional");
    expect(renderReader("stage_complete", props.stage_complete, links).category).toBe("progress");
    expect(renderReader("crosssell_general", props.crosssell_general, links).category).toBe("marketing");
    expect(renderReader("partner_update", props.partner_update, links).category).toBe("partner");
  });

  it("writes the lang attribute from the reader's locale", () => {
    const props = sample("Mood and Energy");
    expect(renderReader("welcome", props.welcome, {}, null, "en-US").html).toContain('<html lang="en-US"');
    expect(renderReader("welcome", props.welcome).html).toContain('<html lang="en-GB"');
  });
});
