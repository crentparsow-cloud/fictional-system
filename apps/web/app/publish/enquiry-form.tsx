"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GENRES } from "@akana/schema";
import { submitEnquiry } from "./action";
import {
  type EnquiryField,
  type EnquiryValues,
  GENRE_LABELS,
  HONEYPOT_FIELD,
  INITIAL_ENQUIRY_STATE,
  INTERESTS,
  INTEREST_LABELS,
  KINDS,
  KIND_LABELS,
} from "./options";

const fieldStyle = (invalid: boolean): React.CSSProperties => ({
  display: "block",
  inlineSize: "100%",
  minBlockSize: "44px",
  padding: "0.6rem 0.75rem",
  border: `1px solid ${invalid ? "var(--rose)" : "var(--line-strong)"}`,
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--ink)",
  font: "inherit",
});

const errorStyle: React.CSSProperties = { color: "var(--rose)", fontWeight: 600, margin: "0.3rem 0 0" };

// Off screen, out of the tab order and hidden from assistive technology.
const honeypotStyle: React.CSSProperties = {
  position: "absolute",
  insetInlineStart: "-10000px",
  inlineSize: "1px",
  blockSize: "1px",
  overflow: "hidden",
};

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontWeight: 600, marginBlockEnd: "0.3rem" }}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} style={errorStyle}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a field: invalid state and the id of its error message. */
function a11y(id: string, error: string | undefined, required = false) {
  return {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    "aria-required": required || undefined,
  };
}

export function EnquiryForm({ brandName }: { brandName: string }) {
  const [state, action, pending] = useActionState(submitEnquiry, INITIAL_ENQUIRY_STATE);
  const errors: Partial<Record<EnquiryField, string>> = state.status === "error" ? state.fieldErrors : {};
  const v: EnquiryValues = state.status === "error" ? state.values : {};

  if (state.status === "success") {
    return (
      <div className="card" style={{ marginBlockStart: "1rem" }}>
        <p role="status" style={{ margin: 0, fontWeight: 600 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    // The key remounts the form after each attempt so the fields show what was sent.
    <form
      key={state.attempt}
      action={action}
      noValidate
      className="card"
      style={{ display: "grid", gap: "1rem", marginBlockStart: "1rem", position: "relative" }}
      aria-describedby="enquiry-note"
    >
      {state.status === "error" ? (
        <p role="alert" style={{ ...errorStyle, marginBlockStart: 0 }}>
          {state.message}
        </p>
      ) : null}

      <Field id="enq-name" label="Your name" required error={errors.name}>
        <input {...a11y("enq-name", errors.name, true)} name="name" type="text" autoComplete="name" maxLength={200} defaultValue={v.name} style={fieldStyle(!!errors.name)} />
      </Field>
      <Field id="enq-email" label="Email" required error={errors.email}>
        <input
          {...a11y("enq-email", errors.email, true)}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          maxLength={254}
          defaultValue={v.email}
          style={fieldStyle(!!errors.email)}
        />
      </Field>
      <Field id="enq-kind" label="I am" required error={errors.kind}>
        <select {...a11y("enq-kind", errors.kind, true)} name="kind" defaultValue={v.kind ?? ""} style={fieldStyle(!!errors.kind)}>
          <option value="">Choose one</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="enq-org" label="Organisation or imprint" error={errors.organisation}>
        <input
          {...a11y("enq-org", errors.organisation)}
          name="organisation"
          type="text"
          autoComplete="organization"
          maxLength={200}
          defaultValue={v.organisation}
          style={fieldStyle(!!errors.organisation)}
        />
      </Field>
      <Field id="enq-title" label="Book title" required error={errors.book_title}>
        <input {...a11y("enq-title", errors.book_title, true)} name="book_title" type="text" maxLength={300} defaultValue={v.book_title} style={fieldStyle(!!errors.book_title)} />
      </Field>
      <Field id="enq-where" label="Where it is published: ISBN or a link" error={errors.book_ref}>
        <input {...a11y("enq-where", errors.book_ref)} name="book_ref" type="text" maxLength={500} defaultValue={v.book_ref} style={fieldStyle(!!errors.book_ref)} />
      </Field>
      <Field id="enq-genre" label="Genre" required error={errors.genre}>
        <select {...a11y("enq-genre", errors.genre, true)} name="genre" defaultValue={v.genre ?? ""} style={fieldStyle(!!errors.genre)}>
          <option value="">Choose one</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {GENRE_LABELS[g]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="enq-interest" label="What you want to talk about" required error={errors.interest}>
        <select {...a11y("enq-interest", errors.interest, true)} name="interest" defaultValue={v.interest ?? ""} style={fieldStyle(!!errors.interest)}>
          <option value="">Choose one</option>
          {INTERESTS.map((i) => (
            <option key={i} value={i}>
              {INTEREST_LABELS[i]}
            </option>
          ))}
        </select>
      </Field>
      <Field id="enq-notes" label="Anything else you want us to know" error={errors.message}>
        <textarea {...a11y("enq-notes", errors.message)} name="message" rows={4} maxLength={4000} defaultValue={v.message} style={fieldStyle(!!errors.message)} />
      </Field>

      <div style={honeypotStyle} aria-hidden="true">
        <label htmlFor="enq-website">Leave this empty</label>
        <input id="enq-website" name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div>
        <div className="check">
          <input
            {...a11y("enq-consent", errors.consent, true)}
            name="consent"
            type="checkbox"
            defaultChecked={v.consent ?? false}
          />
          <label htmlFor="enq-consent">
            You may store what I have entered and contact me about this enquiry. {brandName} does not send marketing
            without a separate opt-in. <span aria-hidden="true">*</span>
          </label>
        </div>
        {errors.consent ? (
          <p id="enq-consent-error" style={errorStyle}>
            {errors.consent}
          </p>
        ) : null}
      </div>

      <div>
        <button type="submit" className="btn" disabled={pending} aria-disabled={pending || undefined}>
          {pending ? "Sending" : "Send enquiry"}
        </button>
      </div>
      <p id="enquiry-note" className="small muted" style={{ margin: 0 }}>
        We reply within [enquiry response time]. Your details go to the {brandName} team and nowhere else. See our{" "}
        <Link href="/legal/privacy">privacy notice</Link>.
      </p>
    </form>
  );
}
