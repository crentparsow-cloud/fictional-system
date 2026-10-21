"use client";

import { useActionState } from "react";
import { INITIAL_TITLE_REQUEST_STATE, type TitleRequestField } from "@/lib/title-request-form";
import { sendTitleRequest } from "./action";

function a11y(id: TitleRequestField, error: string | undefined) {
  return {
    id: `r-${id}`,
    name: id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `r-${id}-error` : undefined,
  };
}

function ErrorLine({ id, error }: { id: TitleRequestField; error?: string }) {
  return error ? (
    <p id={`r-${id}-error`} className="form-error">
      {error}
    </p>
  ) : null;
}

export function RequestForm() {
  const [state, action, pending] = useActionState(sendTitleRequest, INITIAL_TITLE_REQUEST_STATE);

  if (state.status === "success") {
    return (
      <div className="card contact-done" role="status">
        <h2>Thank you. We have your request.</h2>
        <p>We read every request. We cannot reply to each one, and we cannot promise a date.</p>
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
        <label htmlFor="r-title">Title of the book</label>
        <input {...a11y("title", err.title)} type="text" maxLength={200} defaultValue={v.title ?? ""} required />
        <ErrorLine id="title" error={err.title} />
      </div>

      <div className="contact-field">
        <label htmlFor="r-author">Author (if you know it)</label>
        <input {...a11y("author", err.author)} type="text" autoComplete="off" maxLength={200} defaultValue={v.author ?? ""} />
        <ErrorLine id="author" error={err.author} />
      </div>

      <div className="contact-field">
        <label htmlFor="r-note">Why you would like it (optional)</label>
        <p id="r-note-hint" className="muted small">
          Please do not include anything personal. We do not ask for your name or email.
        </p>
        <textarea
          {...a11y("note", err.note)}
          aria-describedby={err.note ? "r-note-hint r-note-error" : "r-note-hint"}
          rows={4}
          maxLength={1000}
          defaultValue={v.note ?? ""}
        />
        <ErrorLine id="note" error={err.note} />
      </div>

      <div className="contact-hp" aria-hidden="true">
        <label htmlFor="r-website">Leave this empty</label>
        <input id="r-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending" : "Send request"}
      </button>
    </form>
  );
}
