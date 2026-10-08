"use client";

import type { WorkbookV3 } from "@akana/schema";
import { useEffect, useRef, useState } from "react";
import { prefillFor, unitOfExercise } from "../progress";
import { repeatScope } from "../store";
import type { AnswerStore } from "../types";
import { ExerciseScreen, type ExerciseMode } from "./Exercise";
import { Card, Eyebrow, minutesWord, unitLabel } from "./parts";

export type ProgrammeUnit = WorkbookV3["units"][number];

export interface UnitScreenProps {
  workbook: WorkbookV3;
  unit: ProgrammeUnit;
  store: AnswerStore;
  readOnly?: boolean;
  /** Force every exercise into one mode. Used by the harness. Leave unset for the reader's own toggle. */
  mode?: ExerciseMode;
  onExerciseDone?: (exerciseId: string, scope: string) => void;
  /** Called when the reader asks for this unit's check-in. */
  onOpenCheckIn?: () => void;
  onOpenSelfCheck?: () => void;
  /** Answer scopes already marked done, so each exercise can say so. */
  done?: ReadonlySet<string>;
  /** Opens a tool from an exercise's toolkit_link. */
  onOpenTool?: (toolId: string) => void;
  /**
   * Open one exercise at a time and page through it (the legacy app's five
   * steps). The unit then lists its exercises with a Full and Short choice.
   * Off by default, so the harness renders every exercise in full.
   */
  paged?: boolean;
}

type Opened = { id: string; scope: string; repeat: boolean; mode: ExerciseMode };

/**
 * One unit: its focus line, the stage primer when the unit opens a stage,
 * the exercises in full, and repeats of earlier exercises as short versions.
 */
export function UnitScreen({ workbook: doc, unit, store, readOnly, mode, onExerciseDone, onOpenCheckIn, onOpenSelfCheck, done, onOpenTool, paged }: UnitScreenProps) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const returned = useRef(false);
  useEffect(() => {
    // Back from an exercise: put focus on the unit heading, not the top of the page.
    if (!opened && returned.current) listHeading.current?.focus();
  }, [opened]);
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  const toolkitTitles = doc.toolkit.map((t) => t.title);
  const stage = doc.structure.stages?.find((s) => s.id === unit.stage || s.units.includes(unit.number));
  const opensStage = stage && stage.units[0] === unit.number;
  const label = unitLabel(doc, unit.number);
  const relatedOf = (e: { toolkit_link?: string }) => {
    const t = e.toolkit_link ? doc.toolkit.find((x) => x.id === e.toolkit_link) : undefined;
    return t ? { id: t.id, title: t.title } : undefined;
  };
  const newTools = (unit.new_toolkit_ids ?? []).map((id) => doc.toolkit.find((t) => t.id === id)).filter((t) => t !== undefined);

  if (paged && opened) {
    const e = byId.get(opened.id);
    if (e) {
      const close = () => {
        returned.current = true;
        setOpened(null);
      };
      return (
        <section className="ak-screen ak-unit" data-unit={unit.number}>
          <ExerciseScreen
            key={`${opened.scope}:${opened.mode}`}
            exercise={e}
            answerScope={opened.repeat ? opened.scope : undefined}
            store={store}
            toolkitTitles={toolkitTitles}
            eyebrow={label}
            readOnly={readOnly}
            isRepeat={opened.repeat}
            defaultMode={e.short_version ? opened.mode : "full"}
            onDone={onExerciseDone ? () => onExerciseDone(e.id, opened.scope) : undefined}
            prefill={opened.repeat ? undefined : (f) => prefillFor(doc, e.id, f, store, toolkitTitles)}
            done={done?.has(opened.scope)}
            earlier={opened.repeat ? { label: (() => { const n = unitOfExercise(doc, e.id); return n ? unitLabel(doc, n) : "Before"; })(), scope: e.id } : undefined}
            relatedTool={relatedOf(e)}
            onOpenTool={onOpenTool}
            paged
            onClose={close}
            closeLabel={`Back to ${label}`}
          />
        </section>
      );
    }
  }

  if (paged) {
    const entries = [
      ...unit.exercise_ids.map((id) => ({ id, scope: id, repeat: false })),
      ...(unit.repeat_ids ?? []).map((id) => ({ id, scope: repeatScope(id), repeat: true })),
    ];
    return (
      <section className="ak-screen ak-unit" data-unit={unit.number}>
        <header className="ak-unit-head">
          <Eyebrow>
            {label}
            {stage ? `, the ${stage.name} stage` : ""}
          </Eyebrow>
          <h2 className="ak-h2" ref={listHeading} tabIndex={-1}>
            {unit.focus}
          </h2>
        </header>

        {opensStage && stage.primer ? (
          <details className="ak-card ak-card-flat ak-details" open>
            <summary>
              The {stage.name} stage: {stage.primer.title}
            </summary>
            <p className="ak-muted">{stage.primer.body}</p>
          </details>
        ) : null}

        {newTools.length ? (
          <Card flat>
            <Eyebrow>New in your Toolkit</Eyebrow>
            <ul className="ak-plain-list">
              {newTools.map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
            </ul>
          </Card>
        ) : null}

        <ul className="ak-ex-list">
          {entries.map(({ id, scope, repeat }) => {
            const e = byId.get(id);
            if (!e) {
              return repeat ? null : (
                <li key={scope}>
                  <Card flat>
                    <p className="ak-muted">This exercise is not written yet.</p>
                  </Card>
                </li>
              );
            }
            const sv = e.short_version;
            const isDone = done?.has(scope) ?? false;
            const first: ExerciseMode = repeat && sv ? "short" : "full";
            const open = (m: ExerciseMode) => setOpened({ id: e.id, scope, repeat, mode: m });
            const headingId = `ak-ex-${scope.replace(/[^a-z0-9_-]/gi, "_")}`;
            return (
              <li key={scope}>
                <Card className="ak-ex-card">
                  <Eyebrow>
                    {repeat ? "Comes back, " : ""}about {minutesWord(e.minutes)}
                    {isDone ? ", done" : ""}
                  </Eyebrow>
                  <h3 className="ak-h3" id={headingId}>
                    {e.title}
                  </h3>
                  <p className="ak-muted">{repeat ? "A short repeat, side by side with your first answers." : e.purpose}</p>
                  {sv ? (
                    <div className="ak-ex-choice" role="group" aria-labelledby={headingId}>
                      {(first === "full" ? (["full", "short"] as const) : (["short", "full"] as const)).map((m, i) => (
                        <button key={m} type="button" className={i === 0 ? "ak-btn" : "ak-btn ak-btn-secondary"} onClick={() => open(m)}>
                          {m === "full" ? "Full version" : "Short version"}
                          <span className="ak-small">About {minutesWord(m === "full" ? e.minutes : sv.minutes)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="button" className="ak-btn" aria-describedby={headingId} onClick={() => open("full")}>
                      {isDone ? "Open again" : "Start"}
                    </button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>

        {unit.selfcheck && doc.selfcheck && onOpenSelfCheck ? (
          <Card>
            <Eyebrow>{label} self-check</Eyebrow>
            <p>The same questions you answered at the start. About three minutes.</p>
            <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenSelfCheck}>
              Start the self-check
            </button>
          </Card>
        ) : null}

        {doc.checkin && onOpenCheckIn ? (
          <Card>
            <Eyebrow>{label} check-in</Eyebrow>
            <p>A few quick questions, or two on a hard week.</p>
            <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenCheckIn}>
              Start check-in
            </button>
          </Card>
        ) : null}
      </section>
    );
  }

  return (
    <section className="ak-screen ak-unit" data-unit={unit.number}>
      <header className="ak-unit-head">
        <Eyebrow>
          {label}
          {stage ? `, the ${stage.name} stage` : ""}
        </Eyebrow>
        <h2 className="ak-h2">{unit.focus}</h2>
      </header>

      {opensStage && stage.primer ? (
        <details className="ak-card ak-card-flat ak-details" open>
          <summary>
            The {stage.name} stage: {stage.primer.title}
          </summary>
          <p className="ak-muted">{stage.primer.body}</p>
        </details>
      ) : null}

      {newTools.length ? (
        <Card flat>
          <Eyebrow>New in your Toolkit</Eyebrow>
          <ul className="ak-plain-list">
            {newTools.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {unit.exercise_ids.map((id) => {
        const e = byId.get(id);
        if (!e) {
          return (
            <Card key={id} flat>
              <p className="ak-muted">This exercise is not written yet.</p>
            </Card>
          );
        }
        return (
          <ExerciseScreen
            key={id}
            exercise={e}
            store={store}
            toolkitTitles={toolkitTitles}
            eyebrow={label}
            readOnly={readOnly}
            mode={mode}
            onDone={onExerciseDone ? () => onExerciseDone(e.id, e.id) : undefined}
            prefill={(f) => prefillFor(doc, e.id, f, store, toolkitTitles)}
            done={done?.has(e.id)}
            relatedTool={relatedOf(e)}
            onOpenTool={onOpenTool}
          />
        );
      })}

      {(unit.repeat_ids ?? []).map((id) => {
        const e = byId.get(id);
        if (!e) return null;
        const scope = repeatScope(e.id);
        return (
          <ExerciseScreen
            key={scope}
            exercise={e}
            answerScope={scope}
            store={store}
            toolkitTitles={toolkitTitles}
            eyebrow={label}
            readOnly={readOnly}
            isRepeat
            mode={e.short_version ? (mode ?? "short") : "full"}
            defaultMode="short"
            onDone={onExerciseDone ? () => onExerciseDone(e.id, scope) : undefined}
            done={done?.has(scope)}
            earlier={{ label: (() => { const n = unitOfExercise(doc, e.id); return n ? unitLabel(doc, n) : "Before"; })(), scope: e.id }}
            relatedTool={relatedOf(e)}
            onOpenTool={onOpenTool}
          />
        );
      })}

      {unit.selfcheck && doc.selfcheck && onOpenSelfCheck ? (
        <Card>
          <Eyebrow>{label} self-check</Eyebrow>
          <p>The same questions you answered at the start. About three minutes.</p>
          <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenSelfCheck}>
            Start the self-check
          </button>
        </Card>
      ) : null}

      {doc.checkin && onOpenCheckIn ? (
        <Card>
          <Eyebrow>{label} check-in</Eyebrow>
          <p>A few quick questions, or two on a hard week.</p>
          <button type="button" className="ak-btn ak-btn-secondary" onClick={onOpenCheckIn}>
            Start check-in
          </button>
        </Card>
      ) : null}
    </section>
  );
}
