"use client";

import { useActionState } from "react";
import { BASIS_LABELS, INITIAL_NOTICE_STATE, NOTICE_BASES, type NoticeField, type NoticeState } from "@/lib/takedown-form";
import { sendCounterNotice, sendNotice } from "./action";

function a11y(id: NoticeField, error: string | undefined, hint?: string) {
  const described = [hint, error ? `n-${id}-error` : null].filter(Boolean).join(" ");
  return {
    id: `n-${id}`,
    name: id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": described || undefined,
  };
}

function ErrorLine({ id, error }: { id: NoticeField; error?: string }) {
  return error ? (
    <p id={`n-${id}-error`} className="form-error">
      {error}
    </p>
  ) : null;
}

function Check({ id, label, error, checked }: { id: "good_faith" | "accurate" | "jurisdiction"; label: string; error?: string; checked?: boolean }) {
  return (
    <div className="contact-field contact-check">
      <input
        id={`n-${id}`}
        name={id}
        type="checkbox"
        value="yes"
        defaultChecked={checked ?? false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `n-${id}-error` : undefined}
      />
      <label htmlFor={`n-${id}`}>{label}</label>
      <ErrorLine id={id} error={error} />
    </div>
  );
}

/**
 * The public notice form (F-123) and, with kind "counter_notice", the
 * counter-notice. Fields follow DMCA 512(c)(3) and 512(g)(3) and DSA
 * Article 16. The server checks everything again.
 */
export function NoticeForm({ kind }: { kind: "notice" | "counter_notice" }) {
  const [state, action, pending] = useActionState<NoticeState, FormData>(kind === "notice" ? sendNotice : sendCounterNotice, INITIAL_NOTICE_STATE);

  if (state.status === "success") {
    return (
      <div className="card contact-done" role="status">
        <h2>{kind === "notice" ? "Thank you. We have your notice." : "Thank you. We have your counter-notice."}</h2>
        <p>
          Your reference is <strong>{state.reference}</strong>. Keep it. We will reply to the email address you gave.
        </p>
        <p className="muted">
          {kind === "notice"
            ? "A person reads every notice. We act quickly on notices that are complete and valid."
            : "We send a copy to the person who sent the original notice. Unless they tell us they have gone to court, the title can go back on sale after 10 to 14 business days."}
        </p>
      </div>
    );
  }

  const err = state.status === "error" ? state.fieldErrors : {};
  const v = state.status === "error" ? state.values : {};

  return (
    <form action={action} className="contact-form notice-form" noValidate key={state.attempt}>
      {state.status === "error" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <fieldset className="notice-fieldset">
        <legend>{kind === "notice" ? "What the notice is about" : "The notice you are answering"}</legend>
        {kind === "notice" ? (
          <div className="contact-field">
            <label htmlFor="n-basis">Type of notice</label>
            <select {...a11y("basis", err.basis)} defaultValue={v.basis ?? ""} required>
              <option value="" disabled>
                Choose one
              </option>
              {NOTICE_BASES.map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABELS[b]}
                </option>
              ))}
            </select>
            <ErrorLine id="basis" error={err.basis} />
          </div>
        ) : (
          <div className="contact-field">
            <label htmlFor="n-reference">Notice reference</label>
            <p id="n-reference-hint" className="muted small">
              From the statement of reasons we sent, like TN-1A2B3C4D5E.
            </p>
            <input {...a11y("reference", err.reference, "n-reference-hint")} type="text" maxLength={13} autoComplete="off" defaultValue={v.reference ?? ""} required />
            <ErrorLine id="reference" error={err.reference} />
          </div>
        )}

        <div className="contact-field">
          <label htmlFor="n-location">{kind === "notice" ? "Where it is on Akana" : "The title that was removed"}</label>
          <p id="n-location-hint" className="muted small">
            A link to the workbook page, or its AK code, like AK-1A2B3. Add the unit or page if you can.
          </p>
          <textarea {...a11y("location", err.location, "n-location-hint")} rows={2} maxLength={1000} defaultValue={v.location ?? ""} required />
          <ErrorLine id="location" error={err.location} />
        </div>

        {kind === "notice" ? (
          <div className="contact-field">
            <label htmlFor="n-work">The work you say is infringed</label>
            <p id="n-work-hint" className="muted small">
              The book, chapter or mark, with a link or ISBN if there is one. Not needed for other unlawful content.
            </p>
            <textarea {...a11y("work", err.work, "n-work-hint")} rows={3} maxLength={2000} defaultValue={v.work ?? ""} />
            <ErrorLine id="work" error={err.work} />
          </div>
        ) : null}

        <div className="contact-field">
          <label htmlFor="n-explanation">{kind === "notice" ? "Why it is unlawful or infringes your rights" : "Why the removal was a mistake"}</label>
          <textarea {...a11y("explanation", err.explanation)} rows={5} maxLength={4000} defaultValue={v.explanation ?? ""} required />
          <ErrorLine id="explanation" error={err.explanation} />
        </div>
      </fieldset>

      <fieldset className="notice-fieldset">
        <legend>About you</legend>
        <div className="contact-field">
          <label htmlFor="n-relationship">You are</label>
          <select {...a11y("relationship", err.relationship)} defaultValue={v.relationship ?? ""} required>
            <option value="" disabled>
              Choose one
            </option>
            {kind === "notice" ? (
              <>
                <option value="owner">The rights holder</option>
                <option value="agent">Acting for the rights holder</option>
              </>
            ) : (
              <>
                <option value="uploader">The author or publisher of the title</option>
                <option value="agent">Acting for them</option>
              </>
            )}
          </select>
          <ErrorLine id="relationship" error={err.relationship} />
        </div>
        <div className="contact-field">
          <label htmlFor="n-acting_for">If you act for someone, who</label>
          <input {...a11y("acting_for", err.acting_for)} type="text" maxLength={200} defaultValue={v.acting_for ?? ""} />
          <ErrorLine id="acting_for" error={err.acting_for} />
        </div>
        <div className="contact-field">
          <label htmlFor="n-name">Full name</label>
          <input {...a11y("name", err.name)} type="text" autoComplete="name" maxLength={200} defaultValue={v.name ?? ""} required />
          <ErrorLine id="name" error={err.name} />
        </div>
        <div className="contact-field">
          <label htmlFor="n-email">Email</label>
          <input {...a11y("email", err.email)} type="email" autoComplete="email" maxLength={254} defaultValue={v.email ?? ""} required />
          <ErrorLine id="email" error={err.email} />
        </div>
        <div className="contact-field">
          <label htmlFor="n-phone">Phone{kind === "notice" ? " (needed for a copyright notice)" : ""}</label>
          <input {...a11y("phone", err.phone)} type="tel" autoComplete="tel" maxLength={40} defaultValue={v.phone ?? ""} />
          <ErrorLine id="phone" error={err.phone} />
        </div>
        <div className="contact-field">
          <label htmlFor="n-address">Postal address</label>
          <textarea {...a11y("address", err.address)} rows={3} autoComplete="street-address" maxLength={500} defaultValue={v.address ?? ""} required />
          <ErrorLine id="address" error={err.address} />
        </div>
      </fieldset>

      <fieldset className="notice-fieldset">
        <legend>Statements</legend>
        {kind === "notice" ? (
          <>
            <Check
              id="good_faith"
              error={err.good_faith}
              checked={v.good_faith}
              label="I believe in good faith that this use of the material is not authorised by the rights holder, their agent or the law, or that the material is unlawful."
            />
            <Check
              id="accurate"
              error={err.accurate}
              checked={v.accurate}
              label="The information in this notice is accurate and complete. Under penalty of perjury, I am the rights holder or I am authorised to act for them."
            />
          </>
        ) : (
          <>
            <Check
              id="good_faith"
              error={err.good_faith}
              checked={v.good_faith}
              label="Under penalty of perjury, I believe in good faith that the material was removed by mistake or because it was misidentified."
            />
            <Check id="accurate" error={err.accurate} checked={v.accurate} label="The information in this counter-notice is accurate." />
            <Check
              id="jurisdiction"
              error={err.jurisdiction}
              checked={v.jurisdiction}
              label="I consent to the jurisdiction of the federal district court for my address, or if I am outside the United States, any judicial district in which Akana may be found, and I will accept service of process from the person who sent the notice or their agent."
            />
          </>
        )}
        <div className="contact-field">
          <label htmlFor="n-signature">Signature: type your full name</label>
          <input {...a11y("signature", err.signature)} type="text" maxLength={200} defaultValue={v.signature ?? ""} required />
          <ErrorLine id="signature" error={err.signature} />
        </div>
      </fieldset>

      {/* Off screen, out of the tab order and hidden from assistive technology. */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="n-website">Leave this empty</label>
        <input id="n-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending" : kind === "notice" ? "Send notice" : "Send counter-notice"}
      </button>
    </form>
  );
}
