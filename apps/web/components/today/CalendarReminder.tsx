"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { REMINDER_LABELS, buildIcs, cleanCustomLabel, CUSTOM_LABEL_MAX, validTime } from "@/lib/calendar";

/**
 * One reminder for all your workbooks (F-016, F-024). The reader picks a
 * time and the words, and the browser makes an .ics file for their own
 * calendar. Nothing is sent to Akana: no time, no label, no click. The
 * chosen time and label are kept on this device only, as a convenience.
 */

const PREF_KEY = "ak:reminder";
type Choice = (typeof REMINDER_LABELS)[number] | "own";

function readPrefRaw(): string | null {
  try {
    return window.localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function parsePref(raw: string | null): { time?: string; choice?: Choice } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { time?: string; choice?: Choice };
  } catch {
    return {};
  }
}

const subscribe = () => () => undefined;

function writePref(p: { time: string; choice: Choice }) {
  try {
    // The reader's own words are not kept, only which kind of label they chose.
    window.localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    // storage blocked: the form simply starts from the defaults next time
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export function CalendarReminder() {
  const id = useId();
  const saved = parsePref(useSyncExternalStore(subscribe, readPrefRaw, () => null));
  const [timeEdit, setTime] = useState<string | null>(null);
  const [choiceEdit, setChoice] = useState<Choice | null>(null);
  const time = timeEdit ?? (saved.time && validTime(saved.time) ? saved.time : "08:00");
  const choice: Choice = choiceEdit ?? (saved.choice && (saved.choice === "own" || (REMINDER_LABELS as readonly string[]).includes(saved.choice)) ? saved.choice : "Daily check");
  const [own, setOwn] = useState("");
  const [made, setMade] = useState(false);

  const summary = choice === "own" ? cleanCustomLabel(own) || REMINDER_LABELS[0] : choice;

  const download = () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const ics = buildIcs({ time: validTime(time) ? time : "08:00", summary, start, uid: randomId(), url: `${window.location.origin}/today` });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "reminder.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    writePref({ time, choice });
    setMade(true);
  };

  return (
    <section className="card reminder-card" aria-labelledby={`${id}-title`} id="reminder">
      <h2 id={`${id}-title`}>One reminder</h2>
      <p className="muted">
        Add one daily reminder to your phone&apos;s calendar. It covers all your workbooks. Your calendar does the reminding, so there are no app
        notifications, and Akana never knows it is there.
      </p>
      <div className="field">
        <label htmlFor={`${id}-time`}>Time</label>
        <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input reminder-time" />
      </div>
      <fieldset className="reminder-words">
        <legend>What the reminder says</legend>
        {REMINDER_LABELS.map((l) => (
          <label key={l} className="check-row">
            <input type="radio" name={`${id}-label`} checked={choice === l} onChange={() => setChoice(l)} />
            <span>{l}</span>
          </label>
        ))}
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
            <p className="muted small">Anyone who sees your calendar will see these words. Leave it blank for &quot;Daily check&quot;.</p>
          </div>
        ) : null}
      </fieldset>
      <button type="button" className="btn" onClick={download}>
        Add to my calendar
      </button>
      {made ? (
        <p className="muted small" role="status">
          Your calendar file is ready. Open it to add the reminder. To stop it, delete the event in your calendar.
        </p>
      ) : null}
    </section>
  );
}
