"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { EditorCheck, SaveState } from "@/app/admin/(gated)/review/editor-actions";

interface Props {
  workbookId: string;
  baseVersionId: string | null;
  baseHash: string | null;
  code: string;
  initialText: string;
  hints: { key: string; required: boolean }[];
  check: (text: string) => Promise<EditorCheck | null>;
  save: (prev: SaveState, fd: FormData) => Promise<SaveState>;
}

/**
 * Staff JSON editor with live validation (F-086). The text goes to the
 * server a moment after typing stops, where @akana/validate runs on it.
 * Save is offered only when the JSON parses, the validator finds no errors,
 * the code is unchanged and the content differs from the version it started
 * from. The server checks all of that again.
 */
export function JsonEditor({ workbookId, baseVersionId, baseHash, code, initialText, hints, check, save }: Props) {
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<EditorCheck | null>(null);
  const [checking, startCheck] = useTransition();
  const [state, formAction, saving] = useActionState(save, { error: null });
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const t = window.setTimeout(() => {
      startCheck(async () => {
        const r = await check(text);
        if (mine === seq.current) setResult(r);
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [text, check]);

  const codeChanged = (() => {
    try {
      const v = JSON.parse(text) as { code?: unknown };
      return v && typeof v === "object" && v.code !== code;
    } catch {
      return false;
    }
  })();
  const unchanged = Boolean(result?.hash && baseHash && result.hash === baseHash);
  const canSave = Boolean(result && !result.parseError && result.errorCount === 0 && !codeChanged && !unchanged && !checking);

  return (
    <div className="json-editor">
      <form action={formAction} className="admin-form json-editor-form">
        <input type="hidden" name="workbook" value={workbookId} />
        {baseVersionId ? <input type="hidden" name="base" value={baseVersionId} /> : null}
        <label htmlFor="je-text">Workbook JSON</label>
        <textarea
          id="je-text"
          name="content"
          className="json-editor-text"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={30}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="je-status"
        />
        <div id="je-status" className="json-editor-status" role="status" aria-live="polite">
          {!result ? (
            <p className="muted">Checking.</p>
          ) : result.parseError ? (
            <p>
              <span className="badge review-fail">Does not parse</span> {result.parseError}
            </p>
          ) : (
            <p>
              {result.ok ? <span className="badge review-pass">Pass</span> : <span className="badge review-fail">Fail</span>} {result.errorCount} error
              {result.errorCount === 1 ? "" : "s"}, {result.warningCount} warning{result.warningCount === 1 ? "" : "s"}.{checking ? " Checking again." : ""}
              {codeChanged ? ` The code must stay ${code}.` : ""}
              {unchanged ? " Nothing has changed yet." : ""}
            </p>
          )}
        </div>
        {state.error ? (
          <p className="admin-notice admin-notice-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="admin-actions">
          <button type="submit" className="btn" disabled={!canSave || saving}>
            {saving ? "Saving" : "Save as a new version"}
          </button>
        </div>
        <p className="muted small">Saving never changes the version you started from. Sign-offs belong to the old content and do not carry over.</p>
      </form>

      {result && !result.parseError && (result.errors.length || result.warnings.length) ? (
        <section aria-labelledby="je-find-h" className="json-editor-findings">
          <h2 id="je-find-h">Validator</h2>
          {[
            { title: "Errors", list: result.errors, count: result.errorCount },
            { title: "Warnings", list: result.warnings, count: result.warningCount },
          ].map(({ title, list, count }) =>
            list.length ? (
              <details key={title} className="review-findings" open={title === "Errors"}>
                <summary>
                  {title} ({count})
                </summary>
                <ul>
                  {list.map((f, i) => (
                    <li key={i}>
                      <span className="badge">{f.category}</span> {f.path ? <code>{f.path}</code> : null} {f.message}
                      {f.excerpt ? <span className="muted"> {f.excerpt}</span> : null}
                    </li>
                  ))}
                </ul>
                {count > list.length ? <p className="muted">Showing the first {list.length}.</p> : null}
              </details>
            ) : null,
          )}
        </section>
      ) : null}

      <details className="json-editor-hints">
        <summary>Schema hints: top-level fields</summary>
        <ul className="json-editor-keys">
          {hints.map((h) => (
            <li key={h.key}>
              <code>{h.key}</code> {h.required ? <span className="muted small">required</span> : <span className="muted small">optional</span>}
            </li>
          ))}
        </ul>
        <p className="muted small">
          The full schema is in packages/schema/src/v3.ts. The internal block is never served to readers. The Help now phone lines come from the
          support lines data, not from this file.
        </p>
      </details>
    </div>
  );
}
