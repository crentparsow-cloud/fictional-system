"use client";

import { useActionState } from "react";
import { INITIAL_SIGNUP_STATE, NEWSLETTER_HONEYPOT } from "@/lib/newsletter-signup";
import { subscribeNewsletter } from "./actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(subscribeNewsletter, INITIAL_SIGNUP_STATE);

  if (state.status === "done") {
    return (
      <div className="card" role="status">
        <h2>Check your email</h2>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="contact-form" noValidate key={state.attempt}>
      {state.status === "error" ? (
        <p className="admin-notice admin-notice-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="contact-field">
        <label htmlFor="nl-email">Your email</label>
        <input id="nl-email" name="email" type="email" autoComplete="email" maxLength={254} defaultValue={state.status === "error" ? state.email : ""} required />
      </div>
      {/* Only a bot fills this in. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="nl-trap">Leave this empty</label>
        <input id="nl-trap" name={NEWSLETTER_HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Sending" : "Send me the newsletter"}
      </button>
    </form>
  );
}
