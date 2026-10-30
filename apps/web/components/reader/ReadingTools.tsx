"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { MarkToolbar } from "./MarkToolbar";
import { Marginalia, type MarginItem } from "./Marginalia";
import { ShortcutSheet } from "./ShortcutSheet";
import { ThenNowCard } from "./ThenNowCard";
import { useFocusMode } from "./useFocusMode";
import { isShown, useParagraphs } from "./useParagraphs";
import {
  COLOUR_NAMES,
  MARK_COLOURS,
  applyChange,
  excerptOf,
  highlightMove,
  isMarkColour,
  placeMarks,
  popChange,
  pushChange,
  type Mark,
  type MarkChange,
  type MarkColour,
} from "@/lib/reading/marks";
import { toggleFocus } from "@/lib/reading/focus";
import { prefersCalm } from "@/lib/reading/motion";
import { READING_EVENT, type ReadingSettings } from "@/lib/reading/settings";
import { currentReading } from "@/lib/reading/settings-client";
import { changeReading } from "@/lib/reading/settings-update";
import { moveMarker, paletteKeyLabel, resolveKey, type ShortcutAction } from "@/lib/reading/shortcuts";

const COLOUR_KEY = "ak:mark-colour";
const ARROWS_KEY = "ak:arrows";

const local = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      // the choice simply is not remembered
    }
  },
};

interface Props {
  enrolmentId: string;
  readOnly: boolean;
  /** The workbook title, for the printed page header. */
  title: string;
  stage: React.RefObject<HTMLDivElement | null>;
}

/**
 * The reading tools (3.4, 3.8, 3.9, 3.10, 3.11), mounted beside the Player.
 *
 * They work on the page the way read aloud does: they look for paragraphs the
 * workbook marked as reading (data-ra) and never touch a field or an answer.
 * A focus marker moves by paragraph; H, N and Z mark, note and undo; the
 * marks and notes are private and sealed on the server. Keys are never taken
 * while the reader is typing. Print and Save as PDF use the browser's own
 * print dialog, so nothing leaves the device.
 */
export function ReadingTools({ enrolmentId, readOnly, title, stage }: Props) {
  const scan = useParagraphs(stage);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  // Only rendered after the workbook has loaded in the browser, so the device can be read in the initial values.
  const [colour, setColour] = useState<MarkColour>(() => {
    const c = local.get(COLOUR_KEY);
    return isMarkColour(c) ? c : "yellow";
  });
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 80rem)").matches);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [trail, setTrail] = useState<MarkChange[]>([]);
  const [reading, setReading] = useState<ReadingSettings>(() => currentReading());
  const [arrows, setArrows] = useState(() => local.get(ARROWS_KEY) !== "off");
  const [tick, setTick] = useState(0);
  const platform = typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent;

  // Changes to the reading settings and the window, heard as they happen.
  useEffect(() => {
    const read = () => setReading(currentReading());
    window.addEventListener(READING_EVENT, read);
    const mq = window.matchMedia("(min-width: 80rem)");
    const wideNow = () => setWide(mq.matches);
    mq.addEventListener("change", wideNow);
    return () => {
      window.removeEventListener(READING_EVENT, read);
      mq.removeEventListener("change", wideNow);
    };
  }, []);

  // The reader's marks for this workbook.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marks?enrolment=${encodeURIComponent(enrolmentId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { marks?: Mark[] } | null) => {
        if (cancelled) return;
        if (j?.marks) setMarks(j.marks.filter((m) => isMarkColour(m.colour)));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enrolmentId]);

  const { placed } = useMemo(() => placeMarks(marks, scan.paras), [marks, scan.paras]);
  // A marker on a paragraph that has left the screen simply shows nowhere.
  // Visibility is checked now, not taken from when the screen was read, so a
  // paragraph that appeared later can still be marked.
  const activePara = scan.paras.find((p) => p.ref === active && isShown(p.el)) ?? null;
  const editingNow = editing && activePara !== null;
  const activeMark = activePara ? (placed.get(activePara.ref) ?? null) : null;

  // Marks and the marker are drawn on the paragraphs with attributes, which React leaves alone.
  useEffect(() => {
    for (const p of scan.paras) {
      const m = placed.get(p.ref);
      if (m) p.el.setAttribute("data-rd-mark", m.colour);
      else p.el.removeAttribute("data-rd-mark");
      if (p.ref === active) p.el.setAttribute("data-rd-focus", "true");
      else p.el.removeAttribute("data-rd-focus");
    }
    return () => {
      for (const p of scan.paras) {
        p.el.removeAttribute("data-rd-mark");
        p.el.removeAttribute("data-rd-focus");
      }
    };
  }, [scan.paras, placed, active]);

  useFocusMode(stage, reading.focus, activePara?.el ?? null);

  // Where things sit, measured from the stage.
  const [layout, setLayout] = useState<{ tops: Map<string, number>; barTop: number }>({ tops: new Map(), barTop: 0 });
  useEffect(() => {
    const measure = () => {
      const box = stage.current?.getBoundingClientRect();
      if (!box) return;
      const tops = new Map<string, number>();
      for (const p of scan.paras) if (isShown(p.el)) tops.set(p.ref, p.el.getBoundingClientRect().top - box.top);
      const barTop = activePara ? activePara.el.getBoundingClientRect().bottom - box.top + 6 : 0;
      setLayout((prev) => (prev.barTop === barTop && prev.tops.size === tops.size && [...tops].every(([k, v]) => Math.abs((prev.tops.get(k) ?? -1) - v) < 1) ? prev : { tops, barTop }));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (stage.current) ro?.observe(stage.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [scan.paras, activePara, stage, marks, reading.size, reading.font, reading.margin, tick]);
  useEffect(() => {
    const again = () => setTick((t) => t + 1);
    window.addEventListener(READING_EVENT, again);
    document.fonts?.ready.then(again).catch(() => undefined);
    return () => window.removeEventListener(READING_EVENT, again);
  }, []);

  const say = useCallback((text: string) => setMessage(text), []);

  // ---- changing marks ----------------------------------------------------
  const commit = useCallback(
    async (ref: string, to: Mark | null, before: Mark | null, undoable = true): Promise<void> => {
      setMarks((cur) => applyChange(cur, ref, to));
      if (undoable) setTrail((t) => pushChange(t, { ref, before, after: to }));
      setBusy(true);
      try {
        const res = to
          ? await fetch("/api/marks", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ enrolment: enrolmentId, ref, colour: to.colour, note: to.note, excerpt: to.excerpt }),
            })
          : await fetch(`/api/marks?enrolment=${encodeURIComponent(enrolmentId)}&ref=${encodeURIComponent(ref)}`, { method: "DELETE" });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(j?.message ?? "failed");
        }
        if (to) {
          const j = (await res.json()) as { mark?: Mark };
          if (j.mark?.id) setMarks((cur) => cur.map((m) => (m.ref === ref ? { ...m, id: j.mark!.id, updatedAt: j.mark!.updatedAt } : m)));
        }
      } catch (e) {
        setMarks((cur) => applyChange(cur, ref, before));
        if (undoable) setTrail((t) => t.slice(0, -1));
        say(e instanceof Error && e.message !== "failed" ? e.message : "That could not be saved just now. Try again in a moment.");
      } finally {
        setBusy(false);
      }
    },
    [enrolmentId, say],
  );

  const mine = useCallback(
    (para: { ref: string; text: string }, c: MarkColour, note = ""): Mark => ({
      id: "",
      ref: para.ref,
      colour: c,
      note,
      excerpt: excerptOf(para.text),
      updatedAt: new Date().toISOString(),
    }),
    [],
  );

  const highlight = useCallback(
    (c: MarkColour = colour) => {
      if (readOnly) return say("Your account is read only, so nothing can be added.");
      if (!activePara) return say(scan.paras.length ? "Press the down arrow or tap a paragraph to choose one first." : "There is nothing to highlight on this screen.");
      const existing = placed.get(activePara.ref) ?? null;
      const move = highlightMove(existing, c);
      setColour(c);
      local.set(COLOUR_KEY, c);
      if (move === "remove") {
        // A mark with a note stays: pressing the same colour again only takes off a bare highlight.
        if (existing?.note) return say("This paragraph has a note, so it stays marked. Use Remove to take both off.");
        void commit(activePara.ref, null, existing);
        return say("Highlight removed.");
      }
      void commit(activePara.ref, move === "add" ? mine(activePara, c) : { ...existing!, colour: c }, existing);
      say(`Highlighted in ${COLOUR_NAMES[c].toLowerCase()}.`);
    },
    [activePara, colour, commit, mine, placed, readOnly, say, scan.paras.length],
  );

  const openNote = useCallback(() => {
    if (readOnly) return say("Your account is read only, so nothing can be added.");
    if (!activePara) return say("Press the down arrow to choose a paragraph first.");
    setEditing(true);
  }, [activePara, readOnly, say]);

  const saveNote = useCallback(
    (note: string) => {
      if (!activePara) return;
      const existing = placed.get(activePara.ref) ?? null;
      if (!existing && !note) {
        setEditing(false);
        return;
      }
      void commit(activePara.ref, existing ? { ...existing, note } : mine(activePara, colour, note), existing);
      setEditing(false);
      say(note ? "Note saved." : "Note cleared.");
    },
    [activePara, colour, commit, mine, placed, say],
  );

  const remove = useCallback(() => {
    const existing = activePara ? (placed.get(activePara.ref) ?? null) : null;
    if (!activePara || !existing) return;
    void commit(activePara.ref, null, existing);
    setEditing(false);
    say("Highlight and note removed.");
  }, [activePara, commit, placed, say]);

  const undo = useCallback(() => {
    const { change, trail: rest } = popChange(trail);
    if (!change) return say("Nothing to undo.");
    setTrail(rest);
    void commit(change.ref, change.before, change.after, false);
    say("Undone.");
  }, [commit, say, trail]);

  // ---- the marker --------------------------------------------------------
  const step1 = useCallback(
    (by: 1 | -1) => {
      const visible = scan.paras.filter((p) => isShown(p.el));
      if (!visible.length) return;
      const now = visible.findIndex((p) => p.ref === active);
      const to = moveMarker(now, visible.length, by);
      const p = visible[to];
      if (!p) return;
      setActive(p.ref);
      setEditing(false);
      p.el.scrollIntoView({ block: "center", behavior: prefersCalm() ? "auto" : "smooth" });
      say(`Paragraph ${to + 1} of ${visible.length}. ${p.text.slice(0, 80)}${p.text.length > 80 ? "..." : ""}`);
    },
    [active, say, scan.paras],
  );

  const run = useCallback(
    (a: ShortcutAction) => {
      switch (a) {
        case "next":
          return step1(1);
        case "prev":
          return step1(-1);
        case "highlight":
          return highlight();
        case "note":
          return openNote();
        case "undo":
          return undo();
        case "sheet":
          return setSheet(true);
        case "palette":
          return setPalette(true);
      }
    },
    [highlight, openNote, step1, undo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = resolveKey(
        { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, isComposing: e.isComposing, defaultPrevented: e.defaultPrevented, target: e.target as Element | null },
        { dialogOpen: sheet || palette },
      );
      if (!a) return;
      if ((a === "next" || a === "prev") && !arrows) return;
      e.preventDefault();
      run(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, sheet, palette, arrows]);

  // Escape clears the marker when nothing else is using it.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && active && !sheet && !palette && !editing) setActive(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [active, sheet, palette, editing]);

  // A tap or click on a paragraph puts the marker there. A selection, a link or a control is left alone.
  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest("a, button, input, textarea, select, label, summary, .rd-toolbar, .rd-margin")) return;
      if (window.getSelection()?.toString()) return;
      const el = t.closest<HTMLElement>("[data-ra]");
      const p = el && isShown(el) ? scan.paras.find((x) => x.el === el) : null;
      if (p) {
        setActive((cur) => (cur === p.ref ? null : p.ref));
        setEditing(false);
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [scan.paras, stage]);

  // ---- print -------------------------------------------------------------
  const printPage = useCallback(
    (withMine: boolean) => {
      const html = document.documentElement;
      const grown: Array<[HTMLTextAreaElement, string]> = [];
      const before = () => {
        html.dataset.print = withMine ? "mine" : "clean";
        if (withMine) {
          document.querySelectorAll<HTMLTextAreaElement>(".ak-player-body textarea").forEach((ta) => {
            grown.push([ta, ta.style.height]);
            ta.style.height = `${ta.scrollHeight + 2}px`;
          });
        }
      };
      const after = () => {
        delete html.dataset.print;
        for (const [ta, h] of grown) ta.style.height = h;
        grown.length = 0;
        window.removeEventListener("afterprint", after);
      };
      before();
      window.addEventListener("afterprint", after);
      // Some browsers do not fire afterprint; the attribute is only read by the print stylesheet, so a late clean-up is harmless.
      window.print();
    },
    [],
  );

  // ---- commands ----------------------------------------------------------
  const commands: PaletteCommand[] = useMemo(() => {
    const list: PaletteCommand[] = [];
    if (!readOnly) {
      list.push(
        { id: "highlight", label: "Highlight the marked paragraph", hint: "H", run: () => highlight() },
        { id: "note", label: "Add or edit a note on the marked paragraph", hint: "N", run: openNote },
        { id: "undo", label: "Undo my last highlight or note", hint: "Z", run: undo },
      );
      for (const c of MARK_COLOURS) list.push({ id: `c-${c}`, label: `Highlight in ${COLOUR_NAMES[c].toLowerCase()}`, run: () => highlight(c) });
    }
    list.push(
      { id: "next", label: "Move the marker to the next paragraph", hint: "Down arrow", run: () => step1(1) },
      { id: "prev", label: "Move the marker to the previous paragraph", hint: "Up arrow", run: () => step1(-1) },
      { id: "export", label: "Export my notes as Markdown", hint: "download", run: () => downloadNotes(enrolmentId) },
      { id: "print", label: "Print this page or save it as a PDF", hint: "without my answers", run: () => printPage(false) },
      { id: "print-mine", label: "Print or save as PDF with my answers and notes", hint: "stays on this device", run: () => printPage(true) },
      {
        id: "dim",
        label: reading.focus === "dim" || reading.focus === "both" ? "Focus mode: stop dimming other paragraphs" : "Focus mode: dim other paragraphs",
        run: () => changeReading({ focus: toggleFocus(reading.focus, "dim") }),
      },
      {
        id: "typewriter",
        label: reading.focus === "typewriter" || reading.focus === "both" ? "Focus mode: stop centring the line I am writing" : "Focus mode: keep the line I am writing centred",
        run: () => changeReading({ focus: toggleFocus(reading.focus, "typewriter") }),
      },
      {
        id: "thennow",
        label: reading.thennow === "on" ? "Turn off the Then and now check-in" : "Turn on the Then and now check-in",
        run: () => changeReading({ thennow: reading.thennow === "on" ? "off" : "on" }),
      },
      {
        id: "arrows",
        label: arrows ? "Turn off the arrow keys for moving between paragraphs" : "Turn on the arrow keys for moving between paragraphs",
        run: () => {
          setArrows(!arrows);
          local.set(ARROWS_KEY, arrows ? "off" : "on");
        },
      },
      { id: "sheet", label: "Show the keyboard shortcuts", hint: "?", run: () => setSheet(true) },
    );
    return list;
  }, [arrows, enrolmentId, highlight, openNote, printPage, reading.focus, reading.thennow, readOnly, step1, undo]);

  // ---- margin notes ------------------------------------------------------
  const noteItems: MarginItem[] = useMemo(
    () =>
      scan.paras
        .filter((p) => isShown(p.el) && placed.get(p.ref)?.note)
        .map((p) => ({ mark: placed.get(p.ref)!, top: layout.tops.get(p.ref) ?? 0 })),
    [scan.paras, placed, layout.tops],
  );
  const openFromMargin = useCallback(
    (ref: string) => {
      const p = scan.paras.find((x) => x.ref === ref);
      if (!p) return;
      setActive(ref);
      setEditing(true);
      p.el.scrollIntoView({ block: "center", behavior: prefersCalm() ? "auto" : "smooth" });
    },
    [scan.paras],
  );

  return (
    <>
      <div className="rd-bar">
        <button type="button" className="rd-open" onClick={() => setPalette(true)} aria-keyshortcuts="Control+K Meta+K">
          Reading tools <span className="small muted">{paletteKeyLabel(platform)}</span>
        </button>
        <button type="button" className="rd-open" onClick={() => setSheet(true)} aria-keyshortcuts="Shift+/">
          Shortcuts
        </button>
        <button type="button" className="rd-open" onClick={() => printPage(false)}>
          Print or save as PDF
        </button>
        {loaded && marks.length ? (
          <a className="rd-open" href={`/api/marks/export?enrolment=${encodeURIComponent(enrolmentId)}`} download>
            Export notes
          </a>
        ) : null}
      </div>
      <p className="rd-live visually-hidden-rd" role="status" aria-live="polite">
        {message}
      </p>
      {message && !activePara ? <p className="small muted rd-hint" aria-hidden="true">{message}</p> : null}

      <ThenNowCard enrolmentId={enrolmentId} enabled={reading.thennow === "on"} readOnly={readOnly} step={scan.step} />

      {activePara ? (
        <div className="rd-pop" style={{ top: layout.barTop }}>
          {readOnly ? null : (
            <MarkToolbar
              mark={activeMark}
              colour={colour}
              editing={editingNow}
              busy={busy}
              canUndo={trail.length > 0}
              onColour={(c) => highlight(c)}
              onEdit={openNote}
              onSaveNote={saveNote}
              onCancelNote={() => setEditing(false)}
              onRemove={remove}
              onUndo={undo}
            />
          )}
        </div>
      ) : null}

      <Marginalia items={noteItems} wide={wide} onOpen={openFromMargin} />

      <div className="rd-print-head" aria-hidden="true">
        <p>{title}</p>
        <p>Printed from Akana</p>
      </div>

      {sheet ? <ShortcutSheet onClose={() => setSheet(false)} /> : null}
      {palette ? <CommandPalette commands={commands} onClose={() => setPalette(false)} /> : null}
    </>
  );
}

/** Starts the Markdown download without leaving the page. */
function downloadNotes(enrolmentId: string): void {
  const a = document.createElement("a");
  a.href = `/api/marks/export?enrolment=${encodeURIComponent(enrolmentId)}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
