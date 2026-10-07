import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type ReaderProps, renderReader } from "./reader";

/**
 * The check-in partner render test (F-030). A partner never learns what the
 * reader is working on: no workbook or book title, no theme, no stage name.
 * Every partner template is rendered at every share level, with every theme
 * and stage names passed in on purpose, and the output is searched for all
 * of them.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

type Catalog = { books: { title: string }[]; topic_sets: { id: string; name: string }[] };
const catalog = JSON.parse(readFileSync(join(root, "content/catalog/catalog.json"), "utf8")) as Catalog;
const v3dir = join(root, "content/workbooks/v3");
const v3 = readdirSync(v3dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(v3dir, f), "utf8")) as { title: string; short_title?: string; theme_id?: string; structure?: { stages?: { name: string }[] } });

const titles = [...new Set([...catalog.books.map((b) => b.title), ...v3.map((w) => w.title), ...v3.map((w) => w.short_title ?? "")])].filter(Boolean);
const GENRE_LABELS = ["Wellbeing", "Personal development", "Relationships", "Parenting", "Career", "Leadership", "Business", "Productivity", "Finance", "Education", "Life skills"];
const themes = [...new Set([...catalog.topic_sets.map((t) => t.name), ...GENRE_LABELS])];
const stageNames = [...new Set(v3.flatMap((w) => (w.structure?.stages ?? []).map((s) => s.name)))].filter((n) => n.length >= 4);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Multi-word names anywhere, case-insensitive; single words as whole words with their own capitals. */
function findAny(text: string, list: string[]): string | null {
  for (const t of list) {
    const re = /\s/.test(t) ? new RegExp(escapeRe(t), "i") : new RegExp(`(^|[^A-Za-z-])${escapeRe(t)}(?![A-Za-z-])`);
    if (re.test(text)) return t;
  }
  return null;
}

const base = (themeName: string) => ({
  name: "Sam",
  appUrl: "https://example.test/home",
  settingsUrl: "https://example.test/you#check-in-partner",
  supportEmail: "support@example.test",
  themeName,
});
const links = { stop: "https://example.test/respond/stop-token", report: "https://example.test/respond/report-token" };
const levels = [1, 2, 3] as const;

function all(themeName: string, labels: string[]) {
  const out: { name: string; text: string; subject: string }[] = [];
  const push = (name: string, r: { subject: string; text: string; html: string }) => out.push({ name, subject: r.subject, text: [r.subject, r.text, r.html].join("\n") });
  for (const shareLevel of levels) {
    push(
      `invite ${shareLevel}`,
      renderReader("partner_invite", { ...base(themeName), readerName: "Sam", partnerName: "Jo", shareLevel, acceptUrl: "https://example.test/yes", declineUrl: "https://example.test/no" }, links),
    );
    push(
      `update ${shareLevel} labels`,
      renderReader("partner_update", { ...base(themeName), readerName: "Sam", partnerName: "Jo", shareLevel, stageLabels: labels, stageIndex: 1, note: "Thanks for asking." }, links),
    );
    push(
      `update ${shareLevel} numbers`,
      renderReader("partner_update", { ...base(themeName), readerName: "Sam", partnerName: "Jo", shareLevel, stageNumber: 2, stageCount: 4, replyUrl: "https://example.test/respond/reply-token" }, links),
    );
    push(`accepted ${shareLevel}`, renderReader("partner_accepted", { ...base(themeName), partnerName: "Jo", shareLevel }, links));
  }
  push("stopped reader", renderReader("partner_stopped", { ...base(themeName), readerName: "Sam", partnerName: "Jo", stoppedBy: "reader" }, links));
  push("stopped partner", renderReader("partner_stopped", { ...base(themeName), readerName: "Sam", partnerName: "Jo", stoppedBy: "partner" }, links));
  return out;
}

describe("check-in partner emails", () => {
  it("has titles, themes and stage names to test against", () => {
    expect(titles.length).toBeGreaterThan(10);
    expect(themes.length).toBeGreaterThan(5);
    expect(stageNames.length).toBeGreaterThan(0);
  });

  it("never names a workbook, a book, a theme or a stage, for any theme and share level", () => {
    const labels = stageNames.slice(0, 4).length === 4 ? stageNames.slice(0, 4) : ["Notice", "Build", "Practise", "Keep"];
    for (const theme of themes) {
      for (const r of all(theme, labels)) {
        expect(findAny(r.text, titles), `${r.name} with ${theme}: title`).toBeNull();
        expect(r.text.toLowerCase(), `${r.name}: theme ${theme}`).not.toContain(theme.toLowerCase());
        expect(findAny(r.text, labels), `${r.name}: stage name`).toBeNull();
      }
    }
  });

  it("keeps subjects fixed: a first name at most", () => {
    for (const r of all("Mood and Energy", ["Notice", "Build", "Practise", "Keep"])) {
      expect(r.subject).not.toMatch(/@|stage|workbook/i);
    }
  });

  it("shares only what the level allows", () => {
    const update = (shareLevel: 1 | 2 | 3) =>
      renderReader("partner_update", { ...base(""), readerName: "Sam", partnerName: "Jo", shareLevel, stageNumber: 2, stageCount: 4, note: "Thanks for asking." }, links).text;
    expect(update(1)).toContain("Sam has reached stage 2 of 4.");
    expect(update(1)).not.toContain("A question you could ask");
    expect(update(1)).not.toContain("Thanks for asking.");
    expect(update(2)).toContain("A question you could ask");
    expect(update(2)).not.toContain("Thanks for asking.");
    expect(update(3)).toContain("Thanks for asking.");
  });

  it("calls it a check-in partner, offers the reply link, and uses no em dash", () => {
    for (const r of all("Mood and Energy", ["Notice", "Build", "Practise", "Keep"])) {
      expect(r.text, r.name).not.toMatch(/support partner/i);
      expect(r.text, r.name).not.toContain("—");
    }
    const props: ReaderProps["partner_update"] = { ...base(""), readerName: "Sam", partnerName: "Jo", shareLevel: 1, stageNumber: 4, stageCount: 4, replyUrl: "https://example.test/r" };
    const last = renderReader("partner_update", props, links);
    expect(last.text).toContain("Send a few kind words");
    expect(last.text).toContain("SAM REACHED THE END");
    expect(last.text).toContain("Sam has finished the last stage of their workbook.");
    expect(last.text).toContain("Stop these updates");
    expect(renderReader("partner_invite", { ...base(""), readerName: "Sam", partnerName: "Jo", shareLevel: 1, acceptUrl: "https://e.test/y", declineUrl: "https://e.test/n" }, links).text).toContain(
      "check-in partner",
    );
  });

  it("tells the partner when the reader stops sharing", () => {
    const r = renderReader("partner_stopped", { ...base(""), readerName: "Sam", partnerName: "Jo", stoppedBy: "reader" }, links);
    expect(r.subject).toBe("Your updates have stopped");
    expect(r.text).toContain("Sam has stopped sharing updates");
    expect(r.text).toContain("isn't something you did");
  });
});
