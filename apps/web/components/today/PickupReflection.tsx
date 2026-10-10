"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * The optional line after a gap (4.9): "What got in the way?" One line, never
 * required, skippable. It is saved as a sealed answer through /api/answers,
 * like any other, under its own field for this gap. Skipping is remembered on
 * this device only, so the prompt does not keep coming back until the reader
 * next does something in the programme.
 */

const subscribe = () => () => undefined;

function skipped(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function PickupReflection({ enrolmentId, field, skipKey, readOnly }: { enrolmentId: string; field: string; skipKey: string; readOnly?: boolean }) {
  const wasSkipped = useSyncExternalStore(subscribe, () => skipped(skipKey), () => false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed" | "skipped">("idle");

  if (readOnly || wasSkipped || state === "skipped") return null;
  if (state === "saved") return <p className="muted small" role="status">Thank you. It is saved with your other answers.</p>;

  async function save() {
    const value = text.trim();
    if (!value) return;
    setState("saving");
    try {
      const res = await fetch("/api/answers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: enrolmentId, field, value }),
      });
      setState(res.ok ? "saved" : "failed");
    } catch {
      setState("failed");
    }
  }

  function skip() {
    try {
      window.localStorage.setItem(skipKey, "1");
    } catch {
      // storage blocked: it hides for this visit only
    }
    setState("skipped");
  }

  return (
    <form
      className="pickup-reflection"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor="pickup-line">
        What got in the way? <span className="muted small">(optional)</span>
      </label>
      <input id="pickup-line" type="text" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <div className="pickup-actions">
        <button type="submit" className="btn secondary" disabled={!text.trim() || state === "saving"}>
          Save
        </button>
        <button type="button" className="linklike" onClick={skip}>
          Skip
        </button>
      </div>
      {state === "failed" ? <p className="muted small">That did not save. You can skip it.</p> : null}
    </form>
  );
}
