import { googleClientId } from "@/lib/google-signin";
import { GoogleOneTap } from "./GoogleOneTap";

/**
 * Google sign-in (13.1) for a server page. Renders One Tap and a "Continue
 * with Google" button while NEXT_PUBLIC_GOOGLE_CLIENT_ID is set, and nothing
 * at all while it is blank. Any page that uses it must be listed in
 * ONE_TAP_PATHS (apps/web/csp.mjs), or its policy blocks Google's script.
 * The soft sign-in wall at the end of a signed-out unit (5.2) drops this in
 * and adds its path there.
 */
export function GoogleSignIn({ next, label, divider }: { next: string; label: string; divider?: string }) {
  const clientId = googleClientId();
  if (!clientId) return null;
  return (
    <>
      <GoogleOneTap clientId={clientId} next={next} label={label} />
      {divider ? (
        <p className="auth-divider muted small" aria-hidden="true">
          {divider}
        </p>
      ) : null}
    </>
  );
}
