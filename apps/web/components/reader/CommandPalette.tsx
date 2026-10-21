"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@/lib/reading/shortcuts";
import { Dialog } from "./Dialog";

export interface PaletteCommand extends Command {
  run: () => void;
}

/**
 * The command list (3.8), opened with Cmd or Ctrl and K or from the Reading
 * tools button. Type to narrow, arrow keys to choose, Enter to run.
 */
export function CommandPalette({ commands, onClose }: { commands: readonly PaletteCommand[]; onClose: () => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);
  const list = useRef<HTMLUListElement>(null);
  const index = Math.min(at, Math.max(0, shown.length - 1));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, shown]);

  const run = (c: PaletteCommand | undefined) => {
    if (!c) return;
    onClose();
    // After the dialog has handed focus back, so a command that needs the page gets it.
    setTimeout(c.run, 0);
  };

  return (
    <Dialog label="Reading tools" onClose={onClose}>
      <h2 className="rd-h" id={`${id}-h`}>
        Reading tools
      </h2>
      <label className="small muted" htmlFor={`${id}-q`}>
        Type to find a tool
      </label>
      <input
        id={`${id}-q`}
        data-autofocus
        className="rd-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-activedescendant={shown[index] ? `${id}-${shown[index]!.id}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAt(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAt(Math.min(shown.length - 1, index + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAt(Math.max(0, index - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(shown[index]);
          }
        }}
      />
      <ul className="rd-cmds" id={`${id}-list`} role="listbox" aria-labelledby={`${id}-h`} ref={list}>
        {shown.map((c, i) => (
          <li
            key={c.id}
            id={`${id}-${c.id}`}
            role="option"
            aria-selected={i === index}
            className="rd-cmd"
            onMouseEnter={() => setAt(i)}
            onClick={() => run(c)}
          >
            <span>{c.label}</span>
            {c.hint ? <span className="small muted">{c.hint}</span> : null}
          </li>
        ))}
      </ul>
      {shown.length === 0 ? (
        <p className="small muted" role="status">
          Nothing matches that.
        </p>
      ) : null}
      <button type="button" className="btn secondary" onClick={onClose}>
        Close
      </button>
    </Dialog>
  );
}
