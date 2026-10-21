import { describe, expect, it } from "vitest";
import { filterCommands, isTyping, moveMarker, paletteKeyLabel, resolveKey, usesArrows, type KeyLike, type TargetLike } from "./shortcuts";

const el = (tagName: string, attrs: Record<string, string> = {}, extra: Partial<TargetLike> = {}): TargetLike => ({
  tagName,
  getAttribute: (n) => attrs[n] ?? null,
  closest: () => null,
  ...extra,
});
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, target: el("BODY"), ...extra });

describe("resolveKey", () => {
  it("maps the reading keys", () => {
    expect(resolveKey(key("ArrowDown"))).toBe("next");
    expect(resolveKey(key("ArrowUp"))).toBe("prev");
    expect(resolveKey(key("h"))).toBe("highlight");
    expect(resolveKey(key("n"))).toBe("note");
    expect(resolveKey(key("z"))).toBe("undo");
    expect(resolveKey(key("?", { shiftKey: true }))).toBe("sheet");
    expect(resolveKey(key("k", { metaKey: true }))).toBe("palette");
    expect(resolveKey(key("K", { ctrlKey: true }))).toBe("palette");
  });

  it("never takes a key while the reader is typing in an answer field", () => {
    for (const k of ["h", "n", "z", "?", "ArrowDown", "ArrowUp"]) {
      expect(resolveKey(key(k, { target: el("TEXTAREA") }))).toBeNull();
      expect(resolveKey(key(k, { target: el("INPUT") }))).toBeNull();
      expect(resolveKey(key(k, { target: el("SELECT") }))).toBeNull();
      expect(resolveKey(key(k, { target: el("DIV", {}, { isContentEditable: true }) }))).toBeNull();
      expect(resolveKey(key(k, { target: el("DIV", { role: "textbox" }) }))).toBeNull();
    }
  });

  it("does not take Cmd or Ctrl K from a field either", () => {
    expect(resolveKey(key("k", { metaKey: true, target: el("TEXTAREA") }))).toBeNull();
    expect(resolveKey(key("k", { ctrlKey: true, target: el("INPUT") }))).toBeNull();
  });

  it("leaves browser shortcuts alone", () => {
    expect(resolveKey(key("z", { metaKey: true }))).toBeNull();
    expect(resolveKey(key("h", { ctrlKey: true }))).toBeNull();
    expect(resolveKey(key("n", { altKey: true }))).toBeNull();
    expect(resolveKey(key("ArrowDown", { shiftKey: true }))).toBeNull();
    expect(resolveKey(key("H", { shiftKey: true }))).toBeNull();
  });

  it("leaves other keys alone, and keys already handled", () => {
    expect(resolveKey(key("a"))).toBeNull();
    expect(resolveKey(key("Enter"))).toBeNull();
    expect(resolveKey(key("h", { defaultPrevented: true }))).toBeNull();
    expect(resolveKey(key("h", { isComposing: true }))).toBeNull();
  });

  it("gives the keyboard to an open dialog", () => {
    expect(resolveKey(key("h"), { dialogOpen: true })).toBeNull();
    expect(resolveKey(key("?", { shiftKey: true }), { dialogOpen: true })).toBeNull();
    expect(resolveKey(key("k", { metaKey: true }), { dialogOpen: true })).toBeNull();
  });

  it("leaves the arrows to controls that use them", () => {
    expect(resolveKey(key("ArrowDown", { target: el("DIV", { role: "radio" }) }))).toBeNull();
    expect(resolveKey(key("ArrowUp", { target: el("DIV", { role: "slider" }) }))).toBeNull();
    expect(resolveKey(key("ArrowDown", { target: el("BUTTON", {}, { closest: () => el("DIV") }) }))).toBeNull();
    // but a plain button still lets the letter shortcuts through
    expect(resolveKey(key("h", { target: el("BUTTON") }))).toBe("highlight");
    expect(resolveKey(key("ArrowDown", { target: el("A") }))).toBe("next");
  });

  it("works with no target", () => {
    expect(resolveKey({ key: "h" })).toBe("highlight");
  });
});

describe("isTyping and usesArrows", () => {
  it("knows editable things", () => {
    expect(isTyping(el("DIV", { contenteditable: "true" }))).toBe(true);
    expect(isTyping(el("DIV", { contenteditable: "false" }))).toBe(false);
    expect(isTyping(el("P"))).toBe(false);
    expect(isTyping(null)).toBe(false);
    expect(usesArrows(el("DIV", { role: "tab" }))).toBe(true);
    expect(usesArrows(el("P"))).toBe(false);
  });
});

describe("moveMarker", () => {
  it("starts at the top going down and the bottom going up", () => {
    expect(moveMarker(-1, 5, 1)).toBe(0);
    expect(moveMarker(-1, 5, -1)).toBe(4);
  });
  it("stops at both ends", () => {
    expect(moveMarker(4, 5, 1)).toBe(4);
    expect(moveMarker(0, 5, -1)).toBe(0);
    expect(moveMarker(2, 5, 1)).toBe(3);
  });
  it("gives -1 when there is nothing to mark", () => {
    expect(moveMarker(0, 0, 1)).toBe(-1);
  });
});

describe("commands", () => {
  const cmds = [
    { id: "hl", label: "Highlight this paragraph" },
    { id: "ex", label: "Export notes as Markdown", hint: "download" },
    { id: "pr", label: "Print or save as PDF" },
  ];
  it("filters by every word typed", () => {
    expect(filterCommands(cmds, "").map((c) => c.id)).toEqual(["hl", "ex", "pr"]);
    expect(filterCommands(cmds, "export md").map((c) => c.id)).toEqual([]);
    expect(filterCommands(cmds, "export mark").map((c) => c.id)).toEqual(["ex"]);
    expect(filterCommands(cmds, "DOWNLOAD").map((c) => c.id)).toEqual(["ex"]);
    expect(filterCommands(cmds, "pdf").map((c) => c.id)).toEqual(["pr"]);
  });
  it("labels the palette key for the platform", () => {
    expect(paletteKeyLabel("MacIntel")).toBe("Cmd K");
    expect(paletteKeyLabel("Win32")).toBe("Ctrl K");
  });
});
