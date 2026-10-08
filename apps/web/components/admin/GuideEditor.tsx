"use client";

import { useActionState } from "react";
import type { GuideSaveState } from "@/app/admin/(gated)/guides/actions";

/**
 * Facilitator guide editor (F-212). A JSON text area; the server validates
 * on save and keeps the text if anything is wrong, so nothing typed is lost.
 */
export function GuideEditor({
  versionId,
  initialText,
  save,
  disabled,
}: {
  versionId: string;
  initialText: string;
  save: (prev: GuideSaveState, fd: FormData) => Promise<GuideSaveState>;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(save, { ok: false, message: null, errors: [], warnings: [] });
  return (
    <form action={action} className="admin-form json-editor-form">
      <input type="hidden" name="version" value={versionId} />
      <label htmlFor="guide-text">Guide JSON</label>
      <textarea id="guide-text" name="text" rows={24} spellCheck={false} defaultValue={initialText} disabled={disabled} className="json-editor-text" />
      {state.message ? (
        <p className={`admin-notice admin-notice-${state.ok ? "ok" : "error"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
      {state.errors.length > 0 ? (
        <ul className="form-error">
          {state.errors.map((e, i) => (
            <li key={i}>
              {e.path ? <code>{e.path}</code> : null} {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      {state.warnings.length > 0 ? (
        <ul className="muted">
          {state.warnings.map((w, i) => (
            <li key={i}>
              Warning: {w.path ? <code>{w.path}</code> : null} {w.message}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="submit" className="btn" disabled={disabled || pending}>
        {pending ? "Checking" : "Check and save draft"}
      </button>
    </form>
  );
}
