"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TotpEnrolForm } from "@/components/mfa/TotpForms";
import { newRecoveryCodes, startReaderEnrolment, turnOffTwoStep, verifyReaderCode, type CodesState, type ReaderCodeState } from "./actions";

/** The eight codes, shown once. Copy them down before leaving. */
export function RecoveryCodes({ codes, lead }: { codes: string[]; lead: string }) {
  return (
    <div className="card you-recovery" role="region" aria-labelledby="recovery-codes-title">
      <h3 id="recovery-codes-title">Your recovery codes</h3>
      <p>{lead}</p>
      <ol className="you-recovery-list">
        {codes.map((c) => (
          <li key={c}>
            <code>{c}</code>
          </li>
        ))}
      </ol>
      <p className="small muted">Each code works once. We keep only a scrambled copy, so we cannot show them again. If you lose them, make new ones from this page.</p>
      <Link href="/you/security" className="btn">
        I have saved them
      </Link>
    </div>
  );
}

/** Turn two-step sign-in on: set up the app, confirm a code, then see the recovery codes. */
export function TurnOnForm() {
  return (
    <TotpEnrolForm<ReaderCodeState>
      enrol={startReaderEnrolment}
      verify={verifyReaderCode}
      next="/you/security"
      initialCodeState={{ error: null }}
      startLabel="Turn on two-step sign-in"
      submitLabel="Confirm"
      idPrefix="reader"
      done={(state) => {
        if (state.codes) return <RecoveryCodes codes={state.codes} lead="Two-step sign-in is on. Save these codes somewhere safe, not on the phone with your authenticator app." />;
        if (state.codesFailed) {
          return (
            <div className="card you-recovery">
              <p>Two-step sign-in is on, but recovery codes could not be made just now.</p>
              <p className="small muted">Make them from this page in a moment. Without them, losing your authenticator means contacting support.</p>
              <Link href="/you/security" className="btn">
                Continue
              </Link>
            </div>
          );
        }
        return null;
      }}
    />
  );
}

/** Replace the recovery codes. */
export function NewCodesForm({ left }: { left: number }) {
  const [state, act, pending] = useActionState<CodesState>(newRecoveryCodes, { error: null });
  if (state.codes) return <RecoveryCodes codes={state.codes} lead="Your old codes no longer work. Save these new ones somewhere safe." />;
  return (
    <form action={act} className="you-actions">
      <p className="small muted">{left === 1 ? "You have 1 recovery code left." : `You have ${left} recovery codes left.`} Making new ones replaces them all.</p>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn secondary" disabled={pending}>
        {pending ? "Making codes" : "Make new recovery codes"}
      </button>
    </form>
  );
}

/** Turn two-step sign-in off, behind a confirm. */
export function TurnOffForm() {
  return (
    <details className="you-delete">
      <summary className="btn secondary">Turn off two-step sign-in</summary>
      <div className="card you-confirm">
        <h3>Turn it off?</h3>
        <p className="muted">Your sign-in link alone will open your account again. Your recovery codes stop working. You can turn it back on any time.</p>
        <form action={turnOffTwoStep}>
          <button type="submit" className="btn danger">
            Turn off
          </button>
        </form>
        <Link href="/you/security" className="btn secondary">
          Keep it on
        </Link>
      </div>
    </details>
  );
}
