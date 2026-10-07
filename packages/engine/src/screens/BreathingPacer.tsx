"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolkitCard } from "./Toolkit";

/**
 * The breathing pacer from the legacy toolkit (runPacer and paceOf, lifted).
 * It shows on a tool whose steps mention an inhale. Three rounds, counts read
 * from the tool's own steps ("inhale ... count to four"), 4 in and 6 out when
 * the steps give no count. The hold is off unless the reader turns it on.
 *
 * No inline styles: the ring's size and timing come from classes, so the
 * page stays inside the CSP. Reduced motion keeps the words and drops the
 * movement (engine.css).
 */

const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

export interface Pace {
  inn: number;
  out: number;
  hold: number;
  /** How many times the steps mention a hold. */
  holds: number;
}

export const breathes = (t: Pick<ToolkitCard, "steps">) => t.steps.some((s) => /\binhale\b/i.test(s));

export function paceOf(t: Pick<ToolkitCard, "steps">): Pace {
  const text = t.steps.join(" ").toLowerCase();
  const n = (re: RegExp) => {
    const m = text.match(re);
    if (!m || !m[1]) return null;
    const v = NUMW[m[1]] ?? Number(m[1]);
    return v > 0 && v < 11 ? v : null;
  };
  return {
    inn: n(/inhale[^.]*?(?:count(?:ing)? to|for(?: a count of)?)\s+(\w+)/) ?? 4,
    out: n(/exhale[^.]*?(?:count(?:ing)? to|for(?: a count of)?)\s+(\w+)/) ?? 6,
    hold: n(/hold[^.]*?(?:count(?:ing)? to|for(?: a count of)?)\s+(\w+)/) ?? 4,
    holds: (text.match(/\bhold\b/g) ?? []).length,
  };
}

type Phase = { word: "Inhale" | "Hold" | "Exhale"; seconds: number; big: boolean };

export function paceSequence(p: Pace, withHold: boolean): Phase[] {
  const seq: Phase[] = [{ word: "Inhale", seconds: p.inn, big: true }];
  if (withHold && p.holds) seq.push({ word: "Hold", seconds: p.hold, big: true });
  seq.push({ word: "Exhale", seconds: p.out, big: false });
  if (withHold && p.holds > 1) seq.push({ word: "Hold", seconds: p.hold, big: false });
  return seq;
}

export const PACER_ROUNDS = 3;

export function BreathingPacer({ tool }: { tool: ToolkitCard }) {
  const pace = paceOf(tool);
  const [withHold, setWithHold] = useState(false);
  const [state, setState] = useState<{ running: boolean; round: number; i: number; done: boolean; stopped: boolean }>({
    running: false,
    round: 1,
    i: 0,
    done: false,
    stopped: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = paceSequence(pace, withHold);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!state.running) return;
    const phase = seq[state.i];
    if (!phase) return;
    timer.current = setTimeout(() => {
      setState((s) => {
        const nextI = s.i + 1;
        if (nextI < seq.length) return { ...s, i: nextI };
        if (s.round >= PACER_ROUNDS) return { running: false, round: s.round, i: 0, done: true, stopped: false };
        return { ...s, round: s.round + 1, i: 0 };
      });
    }, phase.seconds * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // seq is derived from withHold, which cannot change while running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running, state.round, state.i]);

  const phase = state.running ? seq[state.i] : undefined;
  const word = phase ? phase.word : state.done ? "Well done" : state.stopped ? "Stopped" : "Ready";
  const line = phase
    ? `Round ${state.round} of ${PACER_ROUNDS}, count to ${phase.seconds}`
    : state.done
      ? "Now name the feeling"
      : "Three slow breaths";
  const ringClass = phase ? `ak-pacer-ring ak-dur-${Math.min(10, Math.max(1, phase.seconds))} ${phase.big ? "is-big" : "is-small"}` : "ak-pacer-ring";

  return (
    <div className="ak-pacer" data-tool={tool.id}>
      <div className="ak-pacer-orb" aria-hidden="true">
        <span className={ringClass} />
      </div>
      <p className="ak-pacer-word" aria-live="polite">
        <b>{word}</b>
        <span className="ak-small ak-muted">{line}</span>
      </p>
      <div className="ak-pacer-actions">
        <button
          type="button"
          className="ak-btn"
          onClick={() => setState({ running: true, round: 1, i: 0, done: false, stopped: false })}
          disabled={state.running}
        >
          Start
        </button>
        <button
          type="button"
          className="ak-btn ak-btn-secondary"
          onClick={() => setState((s) => ({ ...s, running: false, i: 0, round: 1, stopped: true }))}
          disabled={!state.running}
        >
          Stop
        </button>
      </div>
      {pace.holds ? (
        <label className="ak-check ak-pacer-hold">
          <input type="checkbox" checked={withHold} disabled={state.running} onChange={(e) => setWithHold(e.target.checked)} />
          <span>Include the hold</span>
        </label>
      ) : null}
    </div>
  );
}
