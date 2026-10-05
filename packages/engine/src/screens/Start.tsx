"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Card, Eyebrow } from "./parts";

export interface StartScreenProps {
  workbook: WorkbookV3;
  /** The reader's answer to why_prompt. */
  why: string;
  onWhyChange?: (why: string) => void;
  /** Called when the reader presses "I have read this". */
  onAcknowledge?: () => void;
  readOnly?: boolean;
}

/**
 * Welcome, how it works, the safety notes for wellbeing tiers, and the why
 * prompt. Ends with one button. The self-check that the legacy app ran here
 * is its own screen now.
 */
export function StartScreen({ workbook: doc, why, onWhyChange, onAcknowledge, readOnly }: StartScreenProps) {
  const wellbeing = doc.safety_tier !== "none";
  return (
    <section className="ak-screen ak-start">
      <header>
        <Eyebrow>{doc.short_title ?? doc.title}</Eyebrow>
        <h2 className="ak-h2">Welcome</h2>
      </header>
      <p>{doc.start.welcome}</p>

      <Card>
        <Eyebrow>How it works</Eyebrow>
        <ul className="ak-list">
          {doc.start.how_it_works.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </Card>

      {doc.start.author_note ? (
        <Card flat>
          <Eyebrow>A note from {doc.author.display_name}</Eyebrow>
          <p>{doc.start.author_note}</p>
        </Card>
      ) : null}

      {wellbeing ? (
        <section className="ak-safety" aria-label="Before you begin">
          <h3 className="ak-h3">Before you begin</h3>
          <p>
            This is a self-guided workbook for everyday life. It is not a medical service, and it does not diagnose or
            treat any condition. If you already work with a doctor or therapist, this can sit alongside that.
          </p>
          {doc.start.higher_tier_note ? (
            <div className="ak-banner" role="note">
              <p>{doc.start.higher_tier_note}</p>
            </div>
          ) : null}
          {doc.start.extra_safety_note ? (
            <Card flat>
              <p>{doc.start.extra_safety_note}</p>
            </Card>
          ) : null}
          <p className="ak-note">
            If you ever feel unsafe or in crisis, use <b>Help now</b> at the top of any screen. It shows who to contact
            where you live.
          </p>
        </section>
      ) : null}

      {doc.advice_guardrail && doc.advice_guardrail !== "none" ? (
        <p className="ak-note">
          {
            {
              not_legal_or_tax_advice: "This workbook is for learning. It is not legal or tax advice.",
              not_medical_advice: "This workbook is for learning. It is not medical advice.",
              not_financial_advice: "This workbook is for learning. It is not financial advice.",
            }[doc.advice_guardrail]
          }
        </p>
      ) : null}

      <div className="ak-field">
        <label className="ak-q" htmlFor="ak-start-why">
          {doc.start.why_prompt}
        </label>
        <input
          className="ak-input"
          id="ak-start-why"
          type="text"
          value={why}
          readOnly={readOnly || !onWhyChange}
          onChange={(e) => onWhyChange?.(e.target.value)}
        />
        <p className="ak-muted ak-small">This goes at the top of your plan.</p>
      </div>

      {onAcknowledge ? (
        <button type="button" className="ak-btn" onClick={onAcknowledge}>
          I have read this
        </button>
      ) : null}
    </section>
  );
}
