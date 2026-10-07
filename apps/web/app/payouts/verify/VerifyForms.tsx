"use client";

import { useActionState } from "react";
import { startPayeeEnrolment, verifyPayeeCode, type EnrolState, type VerifyState } from "./actions";

/** Set up an authenticator, then confirm it with a code. */
export function PayeeEnrolForm({ next }: { next: string }) {
  const [state, enrol, enrolling] = useActionState<EnrolState>(startPayeeEnrolment, { status: "idle" });
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
      <PayeeCodeForm next={next} factorId={state.factorId} submitLabel="Confirm and continue" />
    </div>
  );
}

/** Enter a code for the authenticator being set up, or the one already set up. */
export function PayeeCodeForm({ next, factorId, submitLabel = "Verify" }: { next: string; factorId?: string; submitLabel?: string }) {
  const [state, verify, verifying] = useActionState<VerifyState, FormData>(verifyPayeeCode, { error: null });
  return (
    <form action={verify} className="admin-mfa-form" noValidate>
      <input type="hidden" name="next" value={next} />
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <label htmlFor="payee-code">Six-digit code</label>
      <input
        id="payee-code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        aria-describedby={state.error ? "payee-code-error" : undefined}
        aria-invalid={state.error ? true : undefined}
      />
      {state.error ? (
        <p id="payee-code-error" className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={verifying}>
        {verifying ? "Checking" : submitLabel}
      </button>
    </form>
  );
}
