"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { unitName, type Celebration, type PathNode, type UnitWord } from "@/lib/reading/path";
import { stepHref } from "@/lib/today/links";
import { CONFETTI_MOUNT_MS, motionReduced } from "@/lib/motion";
import { Confetti } from "@/components/motion/Confetti";

interface Props {
  nodes: PathNode[];
  word: UnitWord;
  slug: string;
  /** A compact strip of dots for Today. */
  compact?: boolean;
  /** Called instead of following a link, when the map sits beside the Player. */
  onOpenUnit?: (unit: number) => void;
  /** The one moment when a unit closes. */
  celebration?: Celebration | null;
}

const reduced = motionReduced;

const STATE_WORDS = { done: "done", today: "today", locked: "not open yet" } as const;

/**
 * The unit map (3.3). The programme as one vertical path: done units can be
 * tapped to go back, today's unit carries Start, later units are locked.
 * Nothing counts days or says anything is late. When a week closes, one line
 * and one short burst of confetti, never with reduced motion and never on a
 * wellbeing title (the celebration says so).
 */
export function UnitMap({ nodes, word, slug, compact = false, onOpenUnit, celebration = null }: Props) {
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!celebration?.confetti || reduced()) return;
    const on = window.setTimeout(() => setBurst(true), 0);
    const off = window.setTimeout(() => setBurst(false), CONFETTI_MOUNT_MS);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [celebration]);

  if (nodes.length === 0) return null;

  if (compact) {
    const today = nodes.find((n) => n.state === "today");
    return (
      <nav className="um-strip" aria-label="Where you are in the workbook">
        <ol>
          {nodes.map((n) => {
            const label = `${unitName(word, n.number)}, ${STATE_WORDS[n.state]}`;
            return (
              <li key={n.number}>
                {n.state === "locked" ? (
                  <span className="um-dot" data-state="locked" role="img" aria-label={label} />
                ) : (
                  <Link className="um-dot" data-state={n.state} href={`/read/${encodeURIComponent(slug)}?unit=${n.number}`} aria-label={label} aria-current={n.state === "today" ? "step" : undefined} />
                )}
              </li>
            );
          })}
        </ol>
        {today ? <p className="small muted">{unitName(word, today.number)} is next.</p> : <p className="small muted">Every {word} is done.</p>}
      </nav>
    );
  }

  return (
    <nav className="um" aria-label="Your path through the workbook">
      {celebration ? (
        <p className="um-cheer" role="status">
          {celebration.line}
        </p>
      ) : null}
      {burst ? <Confetti /> : null}
      <ol className="um-path">
        {nodes.map((n) => {
          const name = unitName(word, n.number);
          const body = (
            <>
              <span className="um-mark" aria-hidden="true">
                {n.state === "done" ? "✓" : n.number}
              </span>
              <span className="um-text">
                <span className="um-name">{name}</span>
                {n.focus ? <span className="um-focus">{n.focus}</span> : null}
                <span className="um-note small muted">
                  {n.state === "done" ? "Done. Tap to revisit." : n.state === "today" ? (n.stepsDone > 0 ? `${n.stepsDone} of ${n.stepsTotal} steps done` : "Ready when you are") : n.reason === "paywall" ? "Part of the full workbook" : "Opens after the one before"}
                </span>
              </span>
            </>
          );
          return (
            <li key={n.number} className="um-node" data-state={n.state} aria-current={n.state === "today" ? "step" : undefined}>
              {n.state === "done" ? (
                onOpenUnit ? (
                  <button type="button" className="um-row" onClick={() => onOpenUnit(n.number)}>
                    {body}
                  </button>
                ) : (
                  <Link className="um-row" href={`/read/${encodeURIComponent(slug)}?unit=${n.number}`}>
                    {body}
                  </Link>
                )
              ) : (
                <div className="um-row" aria-disabled={n.state === "locked" ? true : undefined}>
                  {body}
                </div>
              )}
              {n.state === "today" ? (
                onOpenUnit ? (
                  <button type="button" className="btn um-start" onClick={() => onOpenUnit(n.number)}>
                    {n.stepsDone > 0 ? "Continue" : "Start"}
                  </button>
                ) : (
                  <Link className="btn um-start" href={n.startExerciseId ? stepHref(slug, { unit: n.number, exerciseId: n.startExerciseId }) : `/read/${encodeURIComponent(slug)}`}>
                    {n.stepsDone > 0 ? "Continue" : "Start"}
                  </Link>
                )
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
