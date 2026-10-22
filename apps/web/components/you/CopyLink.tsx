"use client";

import { useState } from "react";

/** A link in a read-only box with a copy button and, where the device has one, its share sheet. Nothing is sent anywhere by this component. */
export function CopyLink({ url, shareText, label }: { url: string; shareText: string; label: string }) {
  const [note, setNote] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Copied.");
    } catch {
      setNote("Copy did not work. Select the link and copy it by hand.");
    }
  }
  async function share() {
    try {
      await navigator.share({ text: shareText, url });
    } catch {
      // closed without sending, or not supported: the copy button is still there
    }
  }

  return (
    <div>
      <input type="text" readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
      <p>
        <button type="button" className="btn secondary" onClick={copy}>
          Copy the link
        </button>{" "}
        {canShare ? (
          <button type="button" className="btn secondary" onClick={share}>
            Share
          </button>
        ) : null}
      </p>
      {note ? (
        <p className="small muted" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
