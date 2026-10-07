"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SUPPORT_TOPICS, SUPPORT_TOPIC_LABELS } from "@/lib/admin/support";
import { INITIAL_SUPPORT_STATE, type SupportField } from "@/lib/support-form";
import { sendSupportMessage } from "./action";

function a11y(id: SupportField, error: string | undefined) {
  return {
    id: `c-${id}`,
    name: id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `c-${id}-error` : undefined,
  };
}

function ErrorLine({ id, error }: { id: SupportField; error?: string }) {
  return error ? (
    <p id={`c-${id}-error`} className="form-error">
      {error}
    </p>
  ) : null;
}

export function ContactForm() {
  const [state, action, pending] = useActionState(sendSupportMessage, INITIAL_SUPPORT_STATE);

  if (state.status === "success") {
    return (
      <div className="card contact-done" role="status">
        <h2>Thank you. Your message is with us.</h2>
        <p>We reply by email, usually within [support response time].</p>
        {state.worried ? (
          <p>
            <strong>If someone is in danger now, call 999 in the UK, or your local emergency number.</strong> We are not a crisis service and cannot check on
            anyone. <Link href="/help-now">Help now</Link> lists free support lines.
          </p>
        ) : null}
      </div>
    );
  }

  const err = state.status === "error" ? state.fieldErrors : {};
  const v = state.status === "error" ? state.values : {};

  return (
    <form action={action} className="contact-form" noValidate key={state.attempt}>
      {state.status === "error" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="contact-field">
        <label htmlFor="c-topic">What is it about?</label>
        <select {...a11y("topic", err.topic)} defaultValue={v.topic ?? ""} required>
          <option value="" disabled>
            Choose one
          </option>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {SUPPORT_TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
        <ErrorLine id="topic" error={err.topic} />
      </div>

      <div className="contact-field">
        <label htmlFor="c-name">Your name</label>
        <input {...a11y("name", err.name)} type="text" autoComplete="name" maxLength={200} defaultValue={v.name ?? ""} required />
        <ErrorLine id="name" error={err.name} />
      </div>

      <div className="contact-field">
        <label htmlFor="c-email">Your email</label>
        <input {...a11y("email", err.email)} type="email" autoComplete="email" maxLength={254} defaultValue={v.email ?? ""} required />
        <ErrorLine id="email" error={err.email} />
      </div>

      <div className="contact-field">
        <label htmlFor="c-message">Your message</label>
        <p id="c-message-hint" className="muted small">
          Please do not paste anything you wrote in a workbook. We never need it, and we cannot read your answers.
        </p>
        <textarea
          {...a11y("message", err.message)}
          aria-describedby={err.message ? "c-message-hint c-message-error" : "c-message-hint"}
          rows={6}
          maxLength={4000}
          defaultValue={v.message ?? ""}
          required
        />
        <ErrorLine id="message" error={err.message} />
      </div>

      <div className="contact-field contact-check">
        <input
          id="c-consent"
          name="consent"
          type="checkbox"
          value="yes"
          defaultChecked={v.consent ?? false}
          aria-invalid={err.consent ? true : undefined}
          aria-describedby={err.consent ? "c-consent-error" : undefined}
        />
        <label htmlFor="c-consent">Store my message so the Akana team can reply to it.</label>
        <ErrorLine id="consent" error={err.consent} />
      </div>

      {/* Off screen, out of the tab order and hidden from assistive technology. */}
      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="c-website">Leave this empty</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
