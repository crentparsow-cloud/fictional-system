"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { headerActions, parseSessionBody } from "@/lib/site-header";

/**
 * The right-hand side of the public header. The page is served signed out so
 * it can be cached, then this island asks /api/session and swaps to "You" and
 * "Today" for a signed-in reader. If the check fails, the signed-out version
 * stays.
 */
export function HeaderActions() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/session", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live) setSignedIn(parseSessionBody(body));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="site-header-actions" data-signed-in={signedIn ? "true" : "false"}>
      {headerActions(signedIn).map((a) =>
        a.kind === "button" ? (
          <Link key={a.href} href={a.href} className="btn site-cta">{a.label}</Link>
        ) : (
          <Link key={a.href} href={a.href} className="site-signin">{a.label}</Link>
        ),
      )}
    </div>
  );
}
