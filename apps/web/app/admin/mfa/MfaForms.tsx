"use client";

import { useActionState } from "react";
import { startEnrolment, verifyCode, type EnrolState, type VerifyState } from "./actions";

/** Enrol a new authenticator, then confirm it with a code. */
export function EnrolForm() {
  const [state, enrol, enrolling] = useActionState<EnrolState>(startEnrolment, { status: "idle" });

  if (state.status !== "enrolled") {
    return (
      <form action={enrol} className="admin-mfa-form">
        {state.status === "error" ? (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <button type="submit" className="btn" disabled={enrolling}>
          {enrolling ? "Starting set-up" : "Set up an authenticator"}
        </button>
      </form>
    );
  }

  return (
    <div className="admin-mfa-enrol">
      <p>Scan this code with your authenticator app.</p>
      {/* The QR code is an SVG data URI from Supabase Auth, not a remote image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="admin-mfa-qr" src={state.qr} width={200} height={200} alt="QR code for your authenticator app" />
      <details className="admin-mfa-secret">
        <summary>Cannot scan it? Enter the key by hand</summary>
        <p className="muted small">Type this key into your app. Keep it private.</p>
        <code>{state.secret}</code>
      </details>
      <CodeForm factorId={state.factorId} submitLabel="Confirm and continue" />
    </div>
  );
}

/** Enter a code for the factor being enrolled, or for the one already set up. */
export function CodeForm({ factorId, submitLabel = "Verify" }: { factorId?: string; submitLabel?: string }) {
  const [state, verify, verifying] = useActionState<VerifyState, FormData>(verifyCode, { error: null });
  return (
    <form action={verify} className="admin-mfa-form" noValidate>
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <label htmlFor="mfa-code">Six-digit code</label>
      <input
        id="mfa-code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        aria-describedby={state.error ? "mfa-error" : undefined}
        aria-invalid={state.error ? true : undefined}
      />
      {state.error ? (
        <p id="mfa-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={verifying}>
        {verifying ? "Checking" : submitLabel}
      </button>
    </form>
  );
}
