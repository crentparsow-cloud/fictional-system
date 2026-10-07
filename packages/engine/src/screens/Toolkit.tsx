"use client";

import { useState } from "react";
import type { WorkbookV3 } from "@akana/schema";
import { BreathingPacer, breathes } from "./BreathingPacer";
import { Eyebrow, FigurePlaceholder, Steps, minutesWord } from "./parts";

export type ToolkitCard = WorkbookV3["toolkit"][number];

export interface ToolkitScreenProps {
  toolkit: readonly ToolkitCard[];
  /** When given, each card gets an "I used it" button. No counts are shown. */
  onUse?: (toolId: string) => void;
  /** A tool to show first, for example the related tool of an exercise. */
  focusId?: string;
}

export function ToolkitCardView({ tool: t, onUse, used }: { tool: ToolkitCard; onUse?: (id: string) => void; used?: boolean }) {
  return (
    <article className="ak-card ak-tool" data-tool={t.id}>
      <header className="ak-tool-head">
        {t.figure ? <FigurePlaceholder figure={t.figure} /> : null}
        <div>
          <Eyebrow>Tool, about {minutesWord(t.minutes)}</Eyebrow>
          <h3 className="ak-h3">{t.title}</h3>
        </div>
      </header>
      <p>
        <b>When to use it:</b> {t.when_to_use}
      </p>
      {breathes(t) ? <BreathingPacer tool={t} /> : null}
      <Steps steps={t.steps} />
      {t.together ? <p className="ak-muted ak-small">{t.together}</p> : null}
      {onUse ? (
        <button type="button" className="ak-btn ak-btn-secondary" onClick={() => onUse(t.id)}>
          I used it
        </button>
      ) : null}
      {used ? (
        <p className="ak-small ak-muted" role="status">
          Noted. It stays here, ready anytime.
        </p>
      ) : null}
    </article>
  );
}

/** The Toolkit: short tools for hard moments. */
export function ToolkitScreen({ toolkit, onUse, focusId }: ToolkitScreenProps) {
  const [usedId, setUsedId] = useState<string | null>(null);
  const use = onUse
    ? (id: string) => {
        setUsedId(id);
        onUse(id);
      }
    : undefined;
  // A related tool opened from an exercise goes first.
  const ordered = focusId ? [...toolkit].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0)) : toolkit;
  return (
    <section className="ak-screen ak-toolkit">
      <header>
        <h2 className="ak-h2">Toolkit</h2>
        <p className="ak-muted">Short tools for hard moments. Each takes a minute or two.</p>
      </header>
      {toolkit.length ? (
        <div className="ak-stack-lg">
          {ordered.map((t) => (
            <ToolkitCardView key={t.id} tool={t} onUse={use} used={usedId === t.id} />
          ))}
        </div>
      ) : (
        <p className="ak-muted">This workbook has no Toolkit.</p>
      )}
    </section>
  );
}
