"use client";

import { useState } from "react";
import { createCalendarLink, removeCalendarLink } from "@/app/(reader)/you/today-actions";

/**
 * The calendar link for one programme (4.8). Making a link shows it once:
 * Akana keeps only a hash of it, so it cannot be shown again. Making a new
 * one stops the old one. The feed holds unit names and a link back to Today,
 * never an answer. Anyone who has the link can read the feed, so it is the
 * reader's to keep private.
 */
export function CalendarLink({ enrolmentId, hasLink, hasDays }: { enrolmentId: string; hasLink: boolean; hasDays: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [linked, setLinked] = useState(hasLink);
  const [error, setError] = useState(false);

  async function make() {
    setError(false);
    const res = await createCalendarLink(enrolmentId);
    if ("token" in res) {
      setUrl(`${window.location.origin}/api/today/calendar/${res.token}.ics`);
      setLinked(true);
    } else setError(true);
  }

  async function remove() {
    setError(false);
    if (await removeCalendarLink(enrolmentId)) {
      setUrl(null);
      setLinked(false);
    } else setError(true);
  }

  return (
    <div className="calendar-link">
      <p className="small muted">
        {hasDays
          ? "Your remaining steps as all-day events on the days you chose. It shows unit names only, never your answers."
          : "Choose your days above and save, and your remaining steps can appear in your calendar on those days."}
      </p>
      {url ? (
        <>
          <p className="small">Copy this link into your calendar app as a subscription. It is shown once.</p>
          <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" className="you-wrap" />
        </>
      ) : null}
      <div className="you-actions-row">
        <button type="button" className="btn secondary" onClick={() => void make()}>
          {linked ? "Make a new calendar link" : "Make a calendar link"}
        </button>
        {linked ? (
          <button type="button" className="linklike" onClick={() => void remove()}>
            Turn the link off
          </button>
        ) : null}
      </div>
      {linked && !url ? <p className="small muted">A link is on. Making a new one stops the old one.</p> : null}
      {error ? <p className="small muted">That did not work just now.</p> : null}
    </div>
  );
}
