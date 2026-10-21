"use client";

import { useIsStandalone } from "@/components/useDeviceState";

/**
 * Shown on the "check your email" page when Akana is open from the home
 * screen (13.18). A link in an email opens the browser, and on an iPhone the
 * browser and the installed app do not share a session, so the quickest way
 * in is the six-digit code typed here. Renders nothing in a normal browser
 * tab, where the link works as it always did.
 */
export function StandaloneNote() {
  if (!useIsStandalone()) return null;
  return (
    <p className="auth-standalone" role="note">
      You are in the app. Do not open the link: it would open your browser. Type the code from the email below instead.
    </p>
  );
}
