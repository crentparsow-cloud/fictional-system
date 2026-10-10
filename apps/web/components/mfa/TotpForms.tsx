"use client";

import { useActionState, type ReactNode } from "react";

/**
 * Authenticator app enrolment and code entry, shared by the payee step-up
 * (/payouts/verify), the role second factor (/verify) and the reader's
 * optional two-step sign-in (/you/security, 13.2). The server actions are
 * passed in, so each page keeps its own sign-in redirect and what happens
 * after a code is accepted.
 */

export type TotpEnrolState =
  | { status: "idle" }
  | { status: "enrolled"; factorId: string; qr: string; secret: string }
  | { status: "error"; message: string };

export interface TotpCodeState {
  error: string | null;
}

export type TotpEnrolAction = (prev: TotpEnrolState) => Promise<TotpEnrolState>;
export type TotpVerifyAction<S extends TotpCodeState> = (prev: S, formData: FormData) => Promise<S>;

/** Set up an authenticator, then confirm it with a code. */
export function TotpEnrolForm<S extends TotpCodeState>({
  enrol,
  verify,
  next,
  initialCodeState,
  startLabel = "Set up an authenticator",
  submitLabel = "Confirm and continue",
  idPrefix = "totp",
  done,
}: {
  enrol: TotpEnrolAction;
  verify: TotpVerifyAction<S>;
  next: string;
  initialCodeState: S;
  startLabel?: string;
  submitLabel?: string;
  idPrefix?: string;
  /** When it returns something for the code state, that is shown instead of the form. */
  done?: (state: S) => ReactNode;
}) {
  const [state, start, starting] = useActionState<TotpEnrolState>(enrol, { status: "idle" });
  if (state.status !== "enrolled") {
    return (
      <form action={start} className="admin-mfa-form">
        {state.status === "error" ? (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        ) : null}
        <button type="submit" className="btn" disabled={starting}>
          {starting ? "Starting set-up" : startLabel}
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
      <TotpCodeForm verify={verify} next={next} factorId={state.factorId} initialState={initialCodeState} submitLabel={submitLabel} idPrefix={idPrefix} done={done} />
    </div>
  );
}

/** Enter a code for the authenticator being set up, or the one already set up. */
export function TotpCodeForm<S extends TotpCodeState>({
  verify,
  next,
  factorId,
  initialState,
  submitLabel = "Verify",
  idPrefix = "totp",
  done,
}: {
  verify: TotpVerifyAction<S>;
  next: string;
  factorId?: string;
  initialState: S;
  submitLabel?: string;
  idPrefix?: string;
  done?: (state: S) => ReactNode;
}) {
  const [state, act, verifying] = useActionState<S, FormData>(verify, initialState as Awaited<S>);
  const finished = done?.(state);
  if (finished) return <>{finished}</>;
  const inputId = `${idPrefix}-code`;
  const errorId = `${idPrefix}-code-error`;
  return (
    <form action={act} className="admin-mfa-form" noValidate>
      <input type="hidden" name="next" value={next} />
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <label htmlFor={inputId}>Six-digit code</label>
      <input
        id={inputId}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        aria-describedby={state.error ? errorId : undefined}
        aria-invalid={state.error ? true : undefined}
      />
      {state.error ? (
        <p id={errorId} className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn" disabled={verifying}>
        {verifying ? "Checking" : submitLabel}
      </button>
    </form>
  );
}
