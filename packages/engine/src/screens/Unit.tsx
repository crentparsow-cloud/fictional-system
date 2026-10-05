"use client";

import type { WorkbookV3 } from "@akana/schema";
import { repeatScope } from "../store";
import type { AnswerStore } from "../types";
import { ExerciseScreen, type ExerciseMode } from "./Exercise";
import { Card, Eyebrow, unitLabel } from "./parts";

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
}

/**
 * One unit: its focus line, the stage primer when the unit opens a stage,
 * the exercises in full, and repeats of earlier exercises as short versions.
 */
export function UnitScreen({ workbook: doc, unit, store, readOnly, mode, onExerciseDone, onOpenCheckIn, onOpenSelfCheck }: UnitScreenProps) {
  const byId = new Map(doc.exercises.map((e) => [e.id, e]));
  const toolkitTitles = doc.toolkit.map((t) => t.title);
  const stage = doc.structure.stages?.find((s) => s.id === unit.stage || s.units.includes(unit.number));
  const opensStage = stage && stage.units[0] === unit.number;
  const label = unitLabel(doc, unit.number);
  const newTools = (unit.new_toolkit_ids ?? []).map((id) => doc.toolkit.find((t) => t.id === id)).filter((t) => t !== undefined);

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
