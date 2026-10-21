"use client";

import { useEffect, useState } from "react";
import { FEELINGS, shouldOffer } from "@/lib/reading/then-now";

export interface StepInfo {
  ref: string;
  title: string;
}

const STEP_REF = /^[a-z0-9][a-z0-9_:~.-]{0,79}$/;
const askedKey = (enrolmentId: string) => `ak:thennow:${enrolmentId}`;

function readAsked(enrolmentId: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(askedKey(enrolmentId));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeAsked(enrolmentId: string, asked: Set<string>): void {
  try {
    window.sessionStorage.setItem(askedKey(enrolmentId), JSON.stringify([...asked].slice(-60)));
  } catch {
    // the card may simply be offered again
  }
}

/**
 * "Then and now" (3.10): one tap before a step, if the reader turned it on.
 * Five plain words and a way to skip. It is offered once for each step in a
 * visit, never blocks the step, and says where the entry can be seen and
 * deleted. Nothing here counts or scores.
 */
export function ThenNowCard({ enrolmentId, enabled, readOnly, step }: { enrolmentId: string; enabled: boolean; readOnly: boolean; step: StepInfo | null }) {
  // The card is only rendered once the workbook has loaded in the browser, so the device can be read here.
  const [asked, setAsked] = useState<Set<string>>(() => readAsked(enrolmentId));
  const [seen, setSeen] = useState<string | null>(null);
  const [open, setOpen] = useState<StepInfo | null>(null);
  const [state, setState] = useState<"ask" | "saving" | "saved" | "failed">("ask");

  // A new step opened: decide once whether to offer the card for it.
  const stepRef = step && STEP_REF.test(step.ref) ? step.ref : null;
  if (stepRef !== seen) {
    setSeen(stepRef);
    if (step && stepRef && shouldOffer({ enabled, readOnly, stepRef, askedFor: asked })) {
      setAsked(new Set([...asked, stepRef]));
      setOpen(step);
      setState("ask");
    } else {
      setOpen(null);
    }
  }
  useEffect(() => {
    writeAsked(enrolmentId, asked);
  }, [asked, enrolmentId]);

  if (!open || !enabled) return null;

  const tap = async (feeling: number) => {
    setState("saving");
    try {
      const res = await fetch("/api/then-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: enrolmentId, step: open.ref, title: open.title.slice(0, 120), feeling }),
      });
      setState(res.ok ? "saved" : "failed");
    } catch {
      setState("failed");
    }
  };

  if (state === "saved") {
    return (
      <p className="rd-thennow small" role="status">
        Noted. You can see it, or delete it, on the You tab under Then and now.
      </p>
    );
  }

  return (
    <div className="rd-thennow" role="group" aria-label="Then and now">
      <p className="rd-thennow-q">How are you arriving at this step?</p>
      <div className="rd-thennow-row">
        {FEELINGS.map((f) => (
          <button key={f.value} type="button" className="rd-feel" disabled={state === "saving"} onClick={() => void tap(f.value)}>
            {f.word}
          </button>
        ))}
        <button type="button" className="rd-skip" onClick={() => setOpen(null)}>
          Not now
        </button>
      </div>
      {state === "failed" ? (
        <p className="small muted" role="status">
          That could not be saved just now. You can carry on with the step.
        </p>
      ) : (
        <p className="small muted">Only you can see this. You can turn it off in the Aa settings.</p>
      )}
    </div>
  );
}
