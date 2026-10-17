"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_GSI_SCRIPT, GOOGLE_SIGNIN_PATH, hashNonce, newNonce } from "@/lib/google-signin";

/**
 * Google One Tap (13.1). Rendered only when the server passes a client id,
 * which it does only while NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; the page that
 * renders it must be in ONE_TAP_PATHS (apps/web/csp.mjs) so its policy allows
 * accounts.google.com. Nothing here runs on any other page.
 *
 * Google returns an ID token to the callback. It goes to POST /auth/google as
 * an ordinary form submission with the nonce it was minted for, and the
 * server exchanges it for a Supabase session (signInWithIdToken). The
 * session cookie is HttpOnly, so no token is ever handled by client code
 * beyond the hand-off. A "Continue with Google" button is rendered too, for
 * readers who dismissed the prompt or whose browser does not show it.
 */

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  prompt: () => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

export function GoogleOneTap({ clientId, next, label }: { clientId: string; next: string; label: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const credentialRef = useRef<HTMLInputElement>(null);
  const nonceRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const nonce = newNonce();
      const hashed = await hashNonce(nonce);
      await loadGsi();
      if (cancelled) return;
      const id = window.google?.accounts?.id;
      if (!id) {
        setFailed(true);
        return;
      }
      id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (!response.credential || !formRef.current || !credentialRef.current || !nonceRef.current) return;
          credentialRef.current.value = response.credential;
          nonceRef.current.value = nonce;
          formRef.current.submit();
        },
        nonce: hashed,
        context: "signin",
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
      if (buttonRef.current) {
        id.renderButton(buttonRef.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", logo_alignment: "center" });
      }
      id.prompt();
    }

    start().catch(() => setFailed(true));
    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // The library may not have loaded.
      }
    };
  }, [clientId]);

  if (failed) return null;

  return (
    <div className="google-signin" aria-label={label}>
      <div ref={buttonRef} className="google-signin-button" />
      <form ref={formRef} method="post" action={GOOGLE_SIGNIN_PATH} hidden>
        <input ref={credentialRef} type="hidden" name="credential" value="" readOnly />
        <input ref={nonceRef} type="hidden" name="nonce" value="" readOnly />
        <input type="hidden" name="next" value={next} readOnly />
      </form>
    </div>
  );
}

/** Load Google's library once. Resolves when window.google is ready. */
function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("gsi_load_failed")), { once: true });
    if (!existing) {
      script.src = GOOGLE_GSI_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}
