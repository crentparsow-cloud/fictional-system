"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { dailyScope, localDay } from "@akana/engine";
import { fieldKey } from "@/lib/answer-fields";

type Status = "" | "saving" | "saved" | "failed" | "consent" | "read_only";

export interface DailyQuickTapProps {
  enrolmentId: string;
  slug: string;
  /** The workbook's short title, to tell two checks apart. */
  title: string;
  question: string;
  lead: string;
  moreLabel: string;
  readOnly?: boolean;
}

/**
 * The daily check as one tap, 0 to 10, on Today (F-016, legacy parity). The
 * score is the reader's own answer: it goes to /api/answers and is sealed
 * under daily:<local date>.score, exactly where the Player's daily check
 * saves it, so a second save that day replaces the first. The progress event
 * that follows carries no score and no date. "What helped" stays in the
 * full check inside the workbook.
 */
export function DailyQuickTap({ enrolmentId, slug, title, question, lead, moreLabel, readOnly }: DailyQuickTapProps) {
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("");
  const recorded = useRef<string | null>(null);
  const id = useId();

  const save = async (n: number) => {
    if (readOnly) return;
    setScore(n);
    setStatus("saving");
    const day = localDay(new Date());
    try {
      const res = await fetch("/api/answers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrolment: enrolmentId, field: fieldKey(dailyScope(day), "score"), value: n }),
      });
      if (!res.ok) {
        let error: unknown = null;
        try {
          error = ((await res.json()) as { error?: unknown }).error;
        } catch {
          // no body
        }
        setStatus(error === "consent_required" ? "consent" : error === "read_only" ? "read_only" : "failed");
        return;
      }
      setStatus("saved");
      // One event a day from here, whatever the number of taps. Ids only.
      if (recorded.current !== day) {
        recorded.current = day;
        void fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enrolment: enrolmentId, kind: "daily_check_done" }),
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      setStatus("failed");
    }
  };

  const message =
    status === "saving"
      ? "Saving"
      : status === "saved"
        ? "Saved."
        : status === "consent"
          ? "Not saved. Open the workbook to give consent first."
          : status === "read_only"
            ? "Not saved. Your account is read only while its deletion is pending."
            : status === "failed"
              ? "Could not save. Please try again."
              : "";

  return (
    <div className="quick-tap">
      <p className="quick-tap-q" id={`${id}-q`}>
        <b>{question}</b> <span className="muted">{title}</span>
      </p>
      <p className="small muted">{lead}</p>
      <div className="quick-tap-scale" role="group" aria-labelledby={`${id}-q`}>
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" aria-pressed={score === n} aria-label={`${n} out of 10`} disabled={readOnly || status === "saving"} onClick={() => void save(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="small quick-tap-status" role="status" aria-live="polite">
        {message}
      </p>
      <p className="small">
        <Link href={`/read/${slug}?view=daily`}>{moreLabel}</Link>
      </p>
    </div>
  );
}
