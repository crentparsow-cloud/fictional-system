"use client";

import { useState } from "react";

/**
 * The buyer's link maker for a two-person membership (item 6.1). One button
 * asks the server for a link, then the buyer copies it or uses their own
 * device's share sheet. Akana sends nothing to the invitee. The link is held
 * in memory only: it is never put in the address bar, storage or a cookie.
 */
export function SharedSeatLink({ label }: { label: string }) {
  const [link, setLink] = useState<{ url: string; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/membership/share", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; text?: string; error?: string };
      if (res.ok && body.url) setLink({ url: body.url, text: body.text ?? "" });
      else setNote(body.error ?? "Could not make the link just now. Please try again.");
    } catch {
      setNote("Could not make the link just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setNote("Copied.");
    } catch {
      setNote("Copy did not work. Select the link and copy it by hand.");
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ text: link.text, url: link.url });
    } catch {
      // closed without sending, or not supported: the copy button is still there
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="shared-seat-link">
      <button type="button" className="btn secondary" onClick={make} disabled={busy}>
        {label}
      </button>
      {link ? (
        <div role="status">
          <p className="small muted">Send this link to the person you want to share with. It works once, for 14 days. Making a new link replaces it.</p>
          <input type="text" readOnly value={link.url} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} style={{ width: "100%" }} />
          <p>
            <button type="button" className="btn secondary" onClick={copy}>
              Copy link
            </button>{" "}
            {canShare ? (
              <button type="button" className="btn secondary" onClick={share}>
                Share
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
      {note ? (
        <p className="small" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
