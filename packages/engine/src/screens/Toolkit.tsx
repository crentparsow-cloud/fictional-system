"use client";

import type { WorkbookV3 } from "@akana/schema";
import { Eyebrow, FigurePlaceholder, Steps, minutesWord } from "./parts";

export type ToolkitCard = WorkbookV3["toolkit"][number];

export interface ToolkitScreenProps {
  toolkit: readonly ToolkitCard[];
  /** When given, each card gets an "I used it" button. No counts are shown. */
  onUse?: (toolId: string) => void;
}

export function ToolkitCardView({ tool: t, onUse }: { tool: ToolkitCard; onUse?: (id: string) => void }) {
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
      <Steps steps={t.steps} />
      {t.together ? <p className="ak-muted ak-small">{t.together}</p> : null}
      {onUse ? (
        <button type="button" className="ak-btn ak-btn-secondary" onClick={() => onUse(t.id)}>
          I used it
        </button>
      ) : null}
    </article>
  );
}

/** The Toolkit: short tools for hard moments. */
export function ToolkitScreen({ toolkit, onUse }: ToolkitScreenProps) {
  return (
    <section className="ak-screen ak-toolkit">
      <header>
        <h2 className="ak-h2">Toolkit</h2>
        <p className="ak-muted">Short tools for hard moments. Each takes a minute or two.</p>
      </header>
      {toolkit.length ? (
        <div className="ak-stack-lg">
          {toolkit.map((t) => (
            <ToolkitCardView key={t.id} tool={t} onUse={onUse} />
          ))}
        </div>
      ) : (
        <p className="ak-muted">This workbook has no Toolkit.</p>
      )}
    </section>
  );
}
