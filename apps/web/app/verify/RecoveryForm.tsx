"use client";

import { useActionState } from "react";
import { redeemRecoveryCode, type RecoveryState } from "./recovery-actions";

/** Lost the phone: one recovery code turns two-step sign-in off (13.2). */
export function RecoveryForm() {
  const [state, act, pending] = useActionState<RecoveryState, FormData>(redeemRecoveryCode, { error: null });
  return (
    <details className="admin-mfa-secret">
      <summary>Lost your authenticator? Use a recovery code</summary>
      <form action={act} className="admin-mfa-form" noValidate>
        <label htmlFor="recovery-code">Recovery code</label>
        <input
          id="recovery-code"
          name="code"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={14}
          required
          aria-describedby={state.error ? "recovery-code-error" : "recovery-code-help"}
          aria-invalid={state.error ? true : undefined}
        />
        <p id="recovery-code-help" className="small muted">
          One of the codes you saved when you turned two-step sign-in on. Using it turns two-step sign-in off, so you can set it up again with a new phone.
        </p>
        {state.error ? (
          <p id="recovery-code-error" className="form-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <button type="submit" className="btn secondary" disabled={pending}>
          {pending ? "Checking" : "Use this code"}
        </button>
      </form>
    </details>
  );
}
