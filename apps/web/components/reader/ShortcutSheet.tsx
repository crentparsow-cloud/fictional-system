"use client";

import { SHORTCUT_PROMISE, SHORTCUT_SHEET } from "@/lib/reading/shortcuts";
import { Dialog } from "./Dialog";

/** The list of reading shortcuts (3.8), opened with the question mark key. */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Dialog label="Keyboard shortcuts" onClose={onClose}>
      <h2 className="rd-h">Keyboard shortcuts</h2>
      <dl className="rd-keys">
        {SHORTCUT_SHEET.map((s) => (
          <div key={s.keys}>
            <dt>{s.keys}</dt>
            <dd>{s.does}</dd>
          </div>
        ))}
      </dl>
      <p className="small muted">{SHORTCUT_PROMISE}</p>
      <p className="small muted">Space, Page Up and Page Down still scroll the page. You can turn the arrow keys off in the command list.</p>
      <button type="button" className="btn secondary" onClick={onClose} data-autofocus>
        Close
      </button>
    </Dialog>
  );
}
