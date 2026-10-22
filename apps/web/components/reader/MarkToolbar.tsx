"use client";

import { useEffect, useRef, useState } from "react";
import { COLOUR_NAMES, MARK_COLOURS, MAX_NOTE_CHARS, type Mark, type MarkColour } from "@/lib/reading/marks";

/**
 * The small bar under the marked paragraph (3.4): five marker colours, a note,
 * remove and undo. It is how touch and mouse readers highlight; the keyboard
 * does the same with H, N and Z. Typing in the note box never triggers a
 * shortcut.
 */
export function MarkToolbar({
  mark,
  colour,
  editing,
  onColour,
  onEdit,
  onSaveNote,
  onCancelNote,
  onRemove,
  onUndo,
  canUndo,
  busy,
}: {
  mark: Mark | null;
  colour: MarkColour;
  editing: boolean;
  onColour: (c: MarkColour) => void;
  onEdit: () => void;
  onSaveNote: (note: string) => void;
  onCancelNote: () => void;
  onRemove: () => void;
  onUndo: () => void;
  canUndo: boolean;
  busy: boolean;
}) {
  const active = mark?.colour ?? null;
  return (
    <div className="rd-toolbar" role="group" aria-label="Mark this paragraph">
      <div className="rd-swatches" role="group" aria-label="Marker colour">
        {MARK_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            className="rd-swatch"
            data-colour={c}
            aria-pressed={active === c}
            aria-label={active === c ? `${COLOUR_NAMES[c]} marker, on. Press to take it off` : `Highlight in ${COLOUR_NAMES[c].toLowerCase()}`}
            disabled={busy}
            onClick={() => onColour(c)}
          >
            <span aria-hidden="true">{active === c ? "On" : ""}</span>
          </button>
        ))}
      </div>
      <button type="button" className="rd-tbtn" onClick={onEdit} disabled={busy}>
        {mark?.note ? "Edit note" : "Add note"}
      </button>
      {mark ? (
        <button type="button" className="rd-tbtn" onClick={onRemove} disabled={busy}>
          Remove
        </button>
      ) : null}
      <button type="button" className="rd-tbtn" onClick={onUndo} disabled={!canUndo || busy}>
        Undo
      </button>
      <span className="rd-pick small muted" aria-hidden="true">
        Next highlight: {COLOUR_NAMES[colour].toLowerCase()}
      </span>
      {editing ? <NoteForm initial={mark?.note ?? ""} busy={busy} onSave={onSaveNote} onCancel={onCancelNote} /> : null}
    </div>
  );
}

/** The note box. Mounted only while editing, so it starts from the saved note and later changes cannot overwrite what is being typed. */
function NoteForm({ initial, busy, onSave, onCancel }: { initial: string; busy: boolean; onSave: (note: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <form
      className="rd-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text.trim());
      }}
    >
      <label className="small" htmlFor="rd-note-box">
        Your note. Only you can see it.
      </label>
      <textarea
        id="rd-note-box"
        ref={box}
        className="rd-note-box"
        rows={4}
        maxLength={MAX_NOTE_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(text.trim());
          }
        }}
      />
      <div className="rd-note-actions">
        <button type="submit" className="btn" disabled={busy}>
          Save note
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <span className="small muted">Ctrl or Cmd with Enter saves.</span>
      </div>
    </form>
  );
}
