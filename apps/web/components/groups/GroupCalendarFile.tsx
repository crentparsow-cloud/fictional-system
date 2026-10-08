"use client";

import { useId, useState } from "react";
import { buildGroupIcs, cleanCustomLabel, CUSTOM_LABEL_MAX, GROUP_LABEL_DEFAULT } from "@/lib/calendar";

/**
 * The group's unit dates as a calendar file (F-211, reusing F-024). The
 * browser builds the .ics from the schedule already on the page, so nothing
 * is sent to Akana: not the click, not the wording. The default wording
 * names no workbook and no group. The member may choose the workbook's
 * name or their own words instead, and is told who could then see it.
 */

type Choice = "neutral" | "title" | "own";

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export function GroupCalendarFile({ units, workbookTitle }: { units: { unit_number: number; opens_on: string }[]; workbookTitle: string }) {
  const id = useId();
  const [choice, setChoice] = useState<Choice>("neutral");
  const [own, setOwn] = useState("");
  const [made, setMade] = useState(false);
  if (units.length === 0) return null;

  const label = choice === "title" ? workbookTitle : choice === "own" ? cleanCustomLabel(own) || GROUP_LABEL_DEFAULT : GROUP_LABEL_DEFAULT;

  const download = () => {
    const ics = buildGroupIcs({ units, label, uid: randomId(), url: `${window.location.origin}/groups` });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "group-dates.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setMade(true);
  };

  return (
    <details className="group-more group-calendar">
      <summary>Add the unit dates to my calendar</summary>
      <div className="reminder-card">
        <p className="muted">
          One calendar entry for each date a unit opens for your group. Your calendar keeps them, and Akana never knows you added them.
        </p>
        <fieldset className="reminder-words">
          <legend>What the entries say</legend>
          <label className="check-row">
            <input type="radio" name={`${id}-label`} checked={choice === "neutral"} onChange={() => setChoice("neutral")} />
            <span>&quot;Group: unit 1 opens&quot;</span>
          </label>
          <label className="check-row">
            <input type="radio" name={`${id}-label`} checked={choice === "title"} onChange={() => setChoice("title")} />
            <span>The workbook&apos;s name</span>
          </label>
          <label className="check-row">
            <input type="radio" name={`${id}-label`} checked={choice === "own"} onChange={() => setChoice("own")} />
            <span>My own words</span>
          </label>
          {choice === "own" ? (
            <div className="field">
              <label htmlFor={`${id}-own`}>Your words</label>
              <input
                id={`${id}-own`}
                type="text"
                className="input"
                maxLength={CUSTOM_LABEL_MAX}
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}
          {choice !== "neutral" ? <p className="muted small">Anyone who sees your calendar will see these words.</p> : null}
        </fieldset>
        <button type="button" className="btn secondary" onClick={download}>
          Download the calendar file
        </button>
        {made ? (
          <p className="muted small" role="status">
            Your calendar file is ready. Open it to add the dates. If the schedule changes, delete the old entries and download a new file.
          </p>
        ) : null}
      </div>
    </details>
  );
}
