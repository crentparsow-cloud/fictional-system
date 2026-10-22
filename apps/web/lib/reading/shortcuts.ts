/**
 * Keyboard shortcuts for reading (3.8). One pure function decides what a key
 * press means, so it can be tested without a browser. The rule that matters
 * most: nothing is taken while the reader is typing, or while a control that
 * uses the same key is in focus.
 */

export type ShortcutAction = "next" | "prev" | "highlight" | "note" | "undo" | "sheet" | "palette";

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?(name: string): string | null;
  closest?(selector: string): TargetLike | null;
}

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target?: TargetLike | null;
}

const TYPING_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const ARROW_ROLES = new Set(["slider", "radio", "radiogroup", "tab", "tablist", "listbox", "option", "menu", "menuitem", "menubar", "grid", "tree", "treeitem", "scrollbar"]);

/** True while the reader is writing: an answer, a note, a search box, or anything editable. */
export function isTyping(t: TargetLike | null | undefined): boolean {
  if (!t) return false;
  const tag = (t.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT" || tag === "INPUT") return true;
  if (t.isContentEditable) return true;
  const ce = t.getAttribute?.("contenteditable");
  if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
  const role = t.getAttribute?.("role");
  return role ? TYPING_ROLES.has(role) : false;
}

/** True when the focused control uses the arrow keys itself, so the page leaves them alone. */
export function usesArrows(t: TargetLike | null | undefined): boolean {
  if (!t) return false;
  if (isTyping(t)) return true;
  const role = t.getAttribute?.("role");
  if (role && ARROW_ROLES.has(role)) return true;
  return Boolean(t.closest?.('[role="dialog"], [role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"], dialog, details[open] > summary'));
}

export interface KeyContext {
  /** A dialog (the palette, the sheet, a note editor) is open and owns the keyboard. */
  dialogOpen?: boolean;
}

/**
 * What a key press means, or null to leave it alone.
 *
 * Cmd or Ctrl with K opens the command palette. It is not taken while the
 * reader is typing either: pressing Escape first, or using the Reading tools
 * button, gets there. Every other shortcut is a bare key: with Cmd, Ctrl or
 * Alt held it is the browser's, and with Shift held only "?" counts.
 */
export function resolveKey(e: KeyLike, ctx: KeyContext = {}): ShortcutAction | null {
  if (e.defaultPrevented || e.isComposing) return null;
  const target = e.target ?? null;
  if (isTyping(target)) return null;
  const key = e.key;
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && key.toLowerCase() === "k") return ctx.dialogOpen ? null : "palette";
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (ctx.dialogOpen) return null;
  if (key === "?") return "sheet";
  if (e.shiftKey) return null;
  switch (key) {
    case "ArrowDown":
      return usesArrows(target) ? null : "next";
    case "ArrowUp":
      return usesArrows(target) ? null : "prev";
    case "h":
    case "H":
      return "highlight";
    case "n":
    case "N":
      return "note";
    case "z":
    case "Z":
      return "undo";
    default:
      return null;
  }
}

export interface ShortcutHelp {
  keys: string;
  does: string;
}

export const SHORTCUT_SHEET: readonly ShortcutHelp[] = [
  { keys: "Down arrow, Up arrow", does: "Move the focus marker to the next or previous paragraph" },
  { keys: "H", does: "Highlight the marked paragraph. Press again to take it off" },
  { keys: "N", does: "Add or edit a note on the marked paragraph" },
  { keys: "Z", does: "Undo your last highlight or note" },
  { keys: "?", does: "Open this list" },
  { keys: "Ctrl K or Cmd K", does: "Open the command list" },
  { keys: "Escape", does: "Close a list or a note" },
];

/** The line shown under the list: the promise about typing. */
export const SHORTCUT_PROMISE = "These keys do nothing while you are typing in an answer or a note.";

/** Cmd on a Mac, Ctrl elsewhere, for the label on the button. */
export function paletteKeyLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "Cmd K" : "Ctrl K";
}

export interface Command {
  id: string;
  label: string;
  hint?: string;
}

/** Filter commands by what the reader types: every word must appear in the label. */
export function filterCommands<T extends Command>(commands: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...commands];
  return commands.filter((c) => {
    const hay = `${c.label} ${c.hint ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The index of the paragraph the marker moves to, clamped at both ends. */
export function moveMarker(current: number, count: number, by: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return by === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + by));
}
