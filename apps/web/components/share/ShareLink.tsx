"use client";

import { useState } from "react";

/**
 * Copy a link, or hand it to the device's share sheet when there is one. The
 * reader shares through their own channels; Akana sends nothing to anyone.
 */
export function ShareLink({ path, label = "Copy link", shareTitle }: { path: string; label?: string; shareTitle?: string }) {
  const [note, setNote] = useState<string | null>(null);
  const url = () => new URL(path, window.location.origin).toString();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setNote("Copied.");
    } catch {
      setNote("Could not copy. Select the address and copy it by hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: shareTitle ?? "From Akana", url: url() });
    } catch {
      // cancelled: nothing to say
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <span className="share-link">
      <button type="button" className="btn secondary" onClick={copy}>
        {label}
      </button>
      {canShare ? (
        <button type="button" className="btn secondary" onClick={share}>
          Share
        </button>
      ) : null}
      {note ? (
        <span className="muted small" role="status">
          {" "}
          {note}
        </span>
      ) : null}
    </span>
  );
}
