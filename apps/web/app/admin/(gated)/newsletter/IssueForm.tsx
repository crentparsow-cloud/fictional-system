"use client";

import { useActionState } from "react";
import { EMPTY_ISSUE, INITIAL_ISSUE_STATE, type IssueFormValues } from "@/lib/newsletter-form";
import { saveIssue } from "./actions";

/** One issue as a form: new, or an existing draft or scheduled issue. Errors and notes show above the buttons. */
export function IssueForm({ initial = EMPTY_ISSUE, disabled = false }: { initial?: IssueFormValues; disabled?: boolean }) {
  const [state, action, pending] = useActionState(saveIssue, INITIAL_ISSUE_STATE);
  const v = state.status === "error" ? state.values : initial;
  const id = `nl-${initial.id || "new"}`;

  return (
    <form action={action} className="admin-form">
      <input type="hidden" name="id" value={v.id} />
      <fieldset disabled={disabled || pending}>
        <label htmlFor={`${id}-subject`}>Subject, up to 90 characters</label>
        <input id={`${id}-subject`} name="subject" defaultValue={v.subject} maxLength={90} required />
        <label htmlFor={`${id}-pre`}>Preheader, up to 140 characters</label>
        <input id={`${id}-pre`} name="preheader" defaultValue={v.preheader} maxLength={140} />
        <label htmlFor={`${id}-intro`}>Intro, up to 600 characters</label>
        <textarea id={`${id}-intro`} name="intro" rows={3} defaultValue={v.intro} maxLength={600} />
        <label htmlFor={`${id}-head`}>Exercise heading, up to 80 characters</label>
        <input id={`${id}-head`} name="exercise_heading" defaultValue={v.exercise_heading} maxLength={80} required />
        <label htmlFor={`${id}-body`}>Exercise, up to 2,400 characters. A blank line starts a new paragraph.</label>
        <textarea id={`${id}-body`} name="exercise_body" rows={8} defaultValue={v.exercise_body} maxLength={2400} required />

        <fieldset>
          <legend>Sponsored block (optional, a paid cross-recommendation)</legend>
          <p className="muted small">It appears in the email under the label Sponsored. Give all three fields or none.</p>
          <label htmlFor={`${id}-sn`}>Sponsor name</label>
          <input id={`${id}-sn`} name="sponsor_name" defaultValue={v.sponsor_name} maxLength={80} />
          <label htmlFor={`${id}-st`}>Sponsor text, up to 300 characters</label>
          <textarea id={`${id}-st`} name="sponsor_text" rows={2} defaultValue={v.sponsor_text} maxLength={300} />
          <label htmlFor={`${id}-su`}>Sponsor link, starting https://</label>
          <input id={`${id}-su`} name="sponsor_url" type="url" defaultValue={v.sponsor_url} maxLength={300} />
        </fieldset>

        <label htmlFor={`${id}-at`}>Send on (UK time). Needed to schedule.</label>
        <input id={`${id}-at`} name="send_at" type="datetime-local" defaultValue={v.send_at} />

        {state.status === "error" ? (
          <div className="admin-notice admin-notice-error" role="alert">
            <ul>
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {state.status === "ok" ? (
          <p className="admin-notice admin-notice-ok" role="status">
            {state.message}
          </p>
        ) : null}
        {state.status !== "idle" && state.warnings.length ? (
          <div className="admin-note">
            <p>Worth a look, but not blocking:</p>
            <ul>
              {state.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="studio-row-actions">
          <button className="btn secondary" type="submit" name="intent" value="draft">
            Save draft
          </button>
          <button className="btn" type="submit" name="intent" value="schedule">
            Schedule
          </button>
        </div>
      </fieldset>
    </form>
  );
}
