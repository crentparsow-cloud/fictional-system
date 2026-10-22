"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { PasskeyButton } from "@/app/verify/PasskeyForms";
import { PASSKEY_PROMPT_COPY } from "@/lib/mfa/passkey-prompt";
import { dismissPasskeyPrompt } from "./passkey-prompt-actions";

/**
 * A quiet, dismissible card on Today (13.3). Hidden when this browser cannot
 * do passkeys. "Not now" is kept on the account and the card does not return.
 */
export function PasskeyPrompt() {
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => "PublicKeyCredential" in window && Boolean(navigator.credentials),
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!supported || hidden) return null;
  return (
    <section className="card passkey-prompt" aria-labelledby="passkey-prompt-title">
      <h2 id="passkey-prompt-title">{PASSKEY_PROMPT_COPY.title}</h2>
      <p className="muted">{PASSKEY_PROMPT_COPY.body}</p>
      <div className="passkey-prompt-actions">
        <PasskeyButton next="/today" mode="reader-add" />
        <button
          type="button"
          className="btn secondary"
          disabled={pending}
          onClick={() => {
            setHidden(true);
            startTransition(async () => {
              await dismissPasskeyPrompt();
            });
          }}
        >
          {PASSKEY_PROMPT_COPY.later}
        </button>
      </div>
    </section>
  );
}
