"use client";

import { useEffect, useRef, useState } from "react";
import { COLOUR_NAMES, stackTops, type Mark } from "@/lib/reading/marks";

export interface MarginItem {
  mark: Mark;
  /** The paragraph's top, in pixels from the top of the stage. */
  top: number;
}

/** A first guess at a note's height before it has been measured: a few lines of the margin width. */
const guess = (m: Mark) => 70 + Math.ceil(m.note.length / 30) * 20 + (m.excerpt ? 24 : 0);

/**
 * The notes beside the text (3.4). With room, each sits in the right margin
 * level with its paragraph, nudged down if two would overlap. On narrow
 * screens the same notes stack below the page. Only notes show here; a plain
 * highlight is just the marked paragraph.
 */
export function Marginalia({ items, wide, onOpen }: { items: readonly MarginItem[]; wide: boolean; onOpen: (ref: string) => void }) {
  const els = useRef(new Map<string, HTMLElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});

  // Measured as they change size (a long note, a larger text setting). The callback is what sets state.
  useEffect(() => {
    if (!wide || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setHeights((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        els.current.forEach((el, ref) => {
          const h = el.offsetHeight;
          next[ref] = h;
          if (prev[ref] !== h) changed = true;
        });
        return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
      });
    });
    els.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [wide, items]);

  if (!items.length) return null;
  const tops = wide ? stackTops(items.map((it) => ({ top: it.top, height: heights[it.mark.ref] ?? guess(it.mark) }))) : [];
  return (
    <aside className="rd-margin" aria-label="Your notes on this page" data-wide={wide ? "true" : "false"}>
      <h2 className="rd-margin-h">{wide ? "Your notes" : "Your notes on this page"}</h2>
      <ul className="rd-notes">
        {items.map((it, i) => (
          <li
            key={it.mark.ref}
            ref={(el) => {
              if (el) els.current.set(it.mark.ref, el);
              else els.current.delete(it.mark.ref);
            }}
            className="rd-note"
            data-colour={it.mark.colour}
            style={wide ? { top: tops[i] ?? it.top } : undefined}
          >
            {it.mark.excerpt ? <p className="rd-note-quote small">{it.mark.excerpt.length > 90 ? `${it.mark.excerpt.slice(0, 90)}...` : it.mark.excerpt}</p> : null}
            <p className="rd-note-text">{it.mark.note}</p>
            <button type="button" className="rd-note-edit small" onClick={() => onOpen(it.mark.ref)} aria-label={`Open the ${COLOUR_NAMES[it.mark.colour].toLowerCase()} note`}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
