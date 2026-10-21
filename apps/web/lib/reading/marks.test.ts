import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARK_COLOURS,
  applyChange,
  contrastRatio,
  excerptOf,
  exportFileName,
  exportMarkdown,
  highlightMove,
  nextColour,
  paragraphRef,
  placeMarks,
  popChange,
  pushChange,
  stackTops,
  screenHeading,
  screenRef,
  UNDO_DEPTH,
  type Mark,
  type MarkChange,
} from "./marks";

const m = (ref: string, extra: Partial<Mark> = {}): Mark => ({ id: ref, ref, colour: "yellow", note: "", excerpt: "", updatedAt: "2026-10-21T10:00:00Z", ...extra });

const marksCss = readFileSync(resolve(__dirname, "../../app/themes/marks.css"), "utf8").toLowerCase();
// The file has three blocks: light, then dark by device setting, then dark by the reader's choice.
const blocks = marksCss.split(/@media[^{]*\{|:root\[data-theme="dark"\]/);
const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--mark-([a-z]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]));

describe("marker palette", () => {
  const light = tokens(blocks[0]!);
  const darkDevice = tokens(blocks[1]!);
  const darkChosen = tokens(blocks[2]!);
  it("defines every marker and the ink in all three blocks", () => {
    for (const set of [light, darkDevice, darkChosen]) {
      for (const c of [...MARK_COLOURS, "ink"]) expect(set[c], c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("passes 4.5 to 1 contrast for the ink on every marker, light and dark", () => {
    for (const set of [light, darkDevice, darkChosen]) {
      for (const c of MARK_COLOURS) expect(contrastRatio(set.ink!, set[c]!), c).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps the five markers distinguishable from each other", () => {
    expect(new Set(MARK_COLOURS.map((c) => light[c])).size).toBe(5);
    expect(new Set(MARK_COLOURS.map((c) => darkChosen[c])).size).toBe(5);
  });
  it("gives the same dark markers whether the device or the reader chose dark", () => {
    expect(darkDevice).toEqual(darkChosen);
  });
  it("computes contrast the WCAG way", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(() => contrastRatio("red", "#fff")).toThrow();
  });
});

describe("refs", () => {
  it("names a screen from the pieces the Player sets, in the pattern the database accepts", () => {
    const ref = paragraphRef(screenRef({ screen: "ak-exercise", unit: null, exercise: "Plan_First Step", page: "intro" }), 3);
    expect(ref).toBe("exercise:plan_first_step:intro#3");
    expect(ref).toMatch(/^[a-z0-9][a-z0-9_:~.#-]{0,119}$/);
    expect(paragraphRef(screenRef({ screen: "ak-unit", unit: "3", exercise: null, page: null }), 0)).toBe("unit:3#0");
    expect(screenRef({ screen: null, unit: null, exercise: null, page: null })).toBe("screen");
  });
  it("keeps long ids inside the limit", () => {
    expect(paragraphRef(screenRef({ screen: "ak-exercise", unit: null, exercise: "a".repeat(300), page: null }), 12).length).toBeLessThanOrEqual(120);
  });
});

describe("placeMarks", () => {
  const paras = [
    { ref: "unit:3#0", text: "Why this week matters to you." },
    { ref: "unit:3#1", text: "Take one slow breath before you start." },
    { ref: "unit:3#2", text: "A short list of what went well." },
  ];
  it("places a mark on the paragraph its ref names", () => {
    const { placed, unplaced } = placeMarks([m("unit:3#1", { excerpt: "Take one slow breath before you start." })], paras);
    expect([...placed.keys()]).toEqual(["unit:3#1"]);
    expect(unplaced).toEqual([]);
  });
  it("finds the paragraph by its words when the numbering has shifted", () => {
    const shifted = [{ ref: "unit:3#0", text: "A new opening." }, ...paras.map((p, i) => ({ ref: `unit:3#${i + 1}`, text: p.text }))];
    const { placed } = placeMarks([m("unit:3#1", { excerpt: "Take one slow breath before you start." })], shifted);
    expect([...placed.keys()]).toEqual(["unit:3#2"]);
  });
  it("trusts the ref when the mark has no saved words", () => {
    expect([...placeMarks([m("unit:3#2")], paras).placed.keys()]).toEqual(["unit:3#2"]);
  });
  it("leaves marks from other screens alone and does not place the same paragraph twice", () => {
    const r = placeMarks([m("unit:4#1", { excerpt: "x" }), m("unit:3#1", { id: "a", excerpt: "Take one slow breath" }), m("unit:3#2", { id: "b", excerpt: "Take one slow breath" })], paras);
    expect(r.placed.size).toBe(1);
    expect(r.unplaced.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("stackTops", () => {
  it("leaves notes alone when they do not overlap", () => {
    expect(stackTops([{ top: 0, height: 40 }, { top: 100, height: 40 }])).toEqual([0, 100]);
  });
  it("pushes a note down when it would overlap the one above", () => {
    expect(stackTops([{ top: 0, height: 80 }, { top: 20, height: 40 }, { top: 30, height: 40 }], 8)).toEqual([0, 88, 136]);
  });
  it("keeps the answer in the order given, whatever order the notes arrive in", () => {
    expect(stackTops([{ top: 200, height: 40 }, { top: 0, height: 150 }], 10)).toEqual([200, 0]);
    expect(stackTops([{ top: 50, height: 100 }, { top: 0, height: 100 }], 0)).toEqual([100, 0]);
  });
  it("copes with none", () => {
    expect(stackTops([])).toEqual([]);
  });
});

describe("undo", () => {
  const a = m("unit:3#1");
  const b = { ...a, colour: "pink" as const };
  it("walks back through changes, newest first", () => {
    let trail: MarkChange[] = [];
    trail = pushChange(trail, { ref: a.ref, before: null, after: a });
    trail = pushChange(trail, { ref: a.ref, before: a, after: b });
    const first = popChange(trail);
    expect(first.change).toEqual({ ref: a.ref, before: a, after: b });
    const second = popChange(first.trail);
    expect(second.change?.before).toBeNull();
    expect(popChange(second.trail).change).toBeNull();
  });
  it("ignores a change that did nothing and caps the trail", () => {
    expect(pushChange([], { ref: "r", before: null, after: null })).toEqual([]);
    let trail: MarkChange[] = [];
    for (let i = 0; i < UNDO_DEPTH + 10; i++) trail = pushChange(trail, { ref: `r${i}`, before: null, after: m(`r${i}`) });
    expect(trail).toHaveLength(UNDO_DEPTH);
    expect(trail[0]!.ref).toBe("r10");
  });
  it("applies a change to a list, in either direction", () => {
    expect(applyChange([], "unit:3#1", a)).toEqual([a]);
    expect(applyChange([a], "unit:3#1", b)).toEqual([b]);
    expect(applyChange([a], "unit:3#1", null)).toEqual([]);
  });
});

describe("highlight moves", () => {
  it("adds, removes on the same colour, and changes colour otherwise", () => {
    expect(highlightMove(null, "yellow")).toBe("add");
    expect(highlightMove(m("r"), "yellow")).toBe("remove");
    expect(highlightMove(m("r"), "green")).toBe("recolour");
    expect(nextColour("orange")).toBe("yellow");
    expect(nextColour("yellow")).toBe("green");
  });
});

describe("export", () => {
  const marks = [
    m("unit:10#0", { excerpt: "Late paragraph.", note: "Come back to this." }),
    m("unit:2#3", { excerpt: "Second paragraph.", colour: "blue" }),
    m("unit:2#1", { excerpt: "First paragraph.\nOver two lines.", note: "  My note.  ", colour: "pink" }),
    m("exercise:name_the_worry:intro#0", { excerpt: "Write it down." }),
  ];
  const md = exportMarkdown({ title: "Calm in a Week", marks, unitWord: "week", date: "21 October 2026" });

  it("starts with the title and the date, and says the notes are private", () => {
    expect(md.startsWith("# Notes from Calm in a Week\n\nExported 21 October 2026.")).toBe(true);
    expect(md).toContain("Nobody else can see them.");
  });
  it("groups by screen in natural order and by paragraph inside a screen", () => {
    const headings = md.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## Name the worry", "## Week 2", "## Week 10"]);
    expect(md.indexOf("First paragraph.")).toBeLessThan(md.indexOf("Second paragraph."));
  });
  it("quotes the paragraph, names the marker, and puts the trimmed note underneath", () => {
    expect(md).toContain("> First paragraph.\n> Over two lines.\n\nMarker: pink\n\nMy note.\n");
    expect(md).toContain("Marker: blue\n");
  });
  it("says so when nothing is marked", () => {
    expect(exportMarkdown({ title: "T", marks: [], date: "d" })).toContain("You have not marked anything yet.");
  });
  it("uses no em dash", () => {
    expect(md).not.toContain("—");
  });
  it("names the file safely", () => {
    expect(exportFileName("Calm: in a Week!")).toBe("calm-in-a-week-notes.md");
    expect(exportFileName("???")).toBe("workbook-notes.md");
  });
  it("makes headings for the fixed screens", () => {
    expect(screenHeading("toolkit#2")).toBe("Toolkit");
    expect(screenHeading("keep#0")).toBe("Keep going");
    expect(screenHeading("checkin:3#0", "week")).toBe("Check-in");
  });
  it("shortens the excerpt it keeps", () => {
    expect(excerptOf("a   b\n c")).toBe("a b c");
    expect(excerptOf("x".repeat(900))).toHaveLength(600);
  });
});
