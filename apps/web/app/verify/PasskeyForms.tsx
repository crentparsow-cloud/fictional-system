"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { creationOptionsFromJson, credentialToJson, requestOptionsFromJson } from "@/lib/mfa/passkey-json";
import { finishPasskey, startPasskeyAdd, startPasskeyCheck, type CeremonyState, type FinishState } from "./passkey-actions";

/**
 * The browser half of a passkey check or set-up (F-143, flag mfa_passkey).
 * The server starts the ceremony and checks the answer; this only asks the
 * device for the passkey and posts the result back.
 */
export function PasskeyButton({ next, mode }: { next: string; mode: "check" | "add" }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [finish, submitFinish, finishing] = useActionState<FinishState, FormData>(finishPasskey, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState<Extract<CeremonyState, { status: "ready" }> | null>(null);
  const [credential, setCredential] = useState("");

  function run() {
    setMessage(null);
    startTransition(async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
        setMessage("This browser cannot use passkeys. Use your authenticator app.");
        return;
      }
      const state = mode === "add" ? await startPasskeyAdd() : await startPasskeyCheck();
      if (state.status !== "ready") {
        setMessage(state.status === "error" ? state.message : "Try again.");
        return;
      }
      try {
        const publicKey = state.kind === "create" ? creationOptionsFromJson(state.options) : requestOptionsFromJson(state.options);
        if (!publicKey) throw new Error("options");
        const cred =
          state.kind === "create"
            ? await navigator.credentials.create({ publicKey: publicKey as unknown as PublicKeyCredentialCreationOptions })
            : await navigator.credentials.get({ publicKey: publicKey as unknown as PublicKeyCredentialRequestOptions });
        const json = credentialToJson(cred);
        if (!json) throw new Error("credential");
        setReady(state);
        setCredential(JSON.stringify(json));
        // Submit once the hidden fields hold the answer.
        requestAnimationFrame(() => formRef.current?.requestSubmit());
      } catch {
        setMessage("The passkey was cancelled or did not answer. Try again, or use your authenticator app.");
      }
    });
  }

  const error = message ?? finish.error;
  return (
    <div className="mfa-passkey">
      <button type="button" className="btn secondary" onClick={run} disabled={pending || finishing}>
        {pending || finishing ? "Waiting for your passkey" : mode === "add" ? "Add a passkey" : "Use a passkey instead"}
      </button>
      <form ref={formRef} action={submitFinish} hidden>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="kind" value={ready?.kind ?? ""} />
        <input type="hidden" name="factorId" value={ready?.factorId ?? ""} />
        <input type="hidden" name="challengeId" value={ready?.challengeId ?? ""} />
        <input type="hidden" name="credential" value={credential} />
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
