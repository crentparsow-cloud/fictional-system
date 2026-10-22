"use client";

import { useId, useState } from "react";
import { buildSessionIcs, CUSTOM_LABEL_MAX, SESSION_LABEL_DEFAULT, SESSION_MAX } from "@/lib/calendar";

/**
 * Session dates as a calendar file (9.2). The browser builds the .ics, so no
 * calendar service is called and Akana never learns when the group meets. The
 * default wording names no workbook and no group.
 */

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export function SessionScheduler({ units, kitPath }: { units: number; kitPath: string }) {
  const id = useId();
  const [first, setFirst] = useState("");
  const [time, setTime] = useState("19:00");
  const [length, setLength] = useState(60);
  const [every, setEvery] = useState(7);
  const [count, setCount] = useState(Math.min(Math.max(units, 1), SESSION_MAX));
  const [own, setOwn] = useState("");
  const [state, setState] = useState<"idle" | "made" | "error">("idle");

  const download = () => {
    const ics = buildSessionIcs({
      firstDate: first,
      time,
      durationMinutes: length,
      everyDays: every,
      sessions: count,
      label: own,
      uid: randomId(),
      url: `${window.location.origin}${kitPath}`,
    });
    if (!ics) {
      setState("error");
      return;
    }
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "group-sessions.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setState("made");
  };

  return (
    <div className="reminder-card">
      <p className="muted">
        One calendar entry for each session. Your calendar keeps them, and Akana never knows when you meet. Each entry is its own event, so you can move
        one without the rest.
      </p>
      <div className="field">
        <label htmlFor={`${id}-first`}>Date of the first session</label>
        <input id={`${id}-first`} type="date" className="input" value={first} onChange={(e) => setFirst(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-time`}>Start time</label>
        <input id={`${id}-time`} type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-len`}>Length in minutes</label>
        <input id={`${id}-len`} type="number" inputMode="numeric" className="input" min={10} max={480} value={length} onChange={(e) => setLength(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-every`}>How often</label>
        <select id={`${id}-every`} className="input" value={every} onChange={(e) => setEvery(Number(e.target.value))}>
          <option value={7}>Every week</option>
          <option value={14}>Every two weeks</option>
          <option value={28}>Every four weeks</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-count`}>Number of sessions</label>
        <input id={`${id}-count`} type="number" inputMode="numeric" className="input" min={1} max={SESSION_MAX} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-own`}>What the entries say (optional)</label>
        <input
          id={`${id}-own`}
          type="text"
          className="input"
          maxLength={CUSTOM_LABEL_MAX}
          placeholder={SESSION_LABEL_DEFAULT}
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          autoComplete="off"
        />
        <p className="muted small">If you write your own words, anyone who sees your calendar will see them. The default names no workbook and no group.</p>
      </div>
      <button type="button" className="btn secondary" onClick={download}>
        Download the calendar file
      </button>
      {state === "made" ? (
        <p className="muted small" role="status">
          Your calendar file is ready. Open it to add the sessions.
        </p>
      ) : null}
      {state === "error" ? (
        <p className="form-error" role="alert">
          Check the date and the time, then try again.
        </p>
      ) : null}
    </div>
  );
}
