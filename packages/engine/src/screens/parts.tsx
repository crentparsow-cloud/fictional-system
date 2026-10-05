"use client";

import type { WorkbookV3 } from "@akana/schema";
import type { ReactNode } from "react";

type Step = WorkbookV3["exercises"][number]["steps"][number];

/** A neutral stand-in for a figure. Illustrations are chosen later; this keeps the slot. */
export function FigurePlaceholder({ figure, size = "md" }: { figure: string; size?: "sm" | "md" }) {
  return <span className={`ak-fig ak-fig-${size}`} data-figure={figure} aria-hidden="true" />;
}

export function Steps({ steps, heading }: { steps: ReadonlyArray<Step | string>; heading?: string }) {
  return (
    <div className="ak-steps-block">
      {heading ? <h3 className="ak-h3">{heading}</h3> : null}
      <ol className="ak-steps">
        {steps.map((s, i) => {
          const text = typeof s === "string" ? s : s.text;
          const figure = typeof s === "string" ? undefined : s.figure;
          return (
            <li key={i}>
              <span className="ak-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="ak-step-body">
                <p>{text}</p>
                {figure ? <FigurePlaceholder figure={figure} size="sm" /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="ak-eyebrow">{children}</span>;
}

export function Card({ children, flat, className = "" }: { children: ReactNode; flat?: boolean; className?: string }) {
  return <div className={`ak-card ${flat ? "ak-card-flat" : ""} ${className}`.trim()}>{children}</div>;
}

export function unitLabel(doc: Pick<WorkbookV3, "structure">, n: number): string {
  const word = { week: "Week", day: "Day", module: "Module", chapter: "Chapter" }[doc.structure.unit];
  return `${word} ${n}`;
}

export const minutesWord = (m: number) => `${m} minute${m === 1 ? "" : "s"}`;
