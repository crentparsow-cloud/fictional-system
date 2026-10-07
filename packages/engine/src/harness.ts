import type { WorkbookV3 } from "@akana/schema";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckInScreen } from "./screens/CheckIn";
import { DailyCheckScreen, emptyDailyCheck } from "./screens/DailyCheck";
import { ExerciseScreen } from "./screens/Exercise";
import { FinishScreen } from "./screens/Finish";
import { KeepGoingScreen } from "./screens/KeepGoing";
import { PlanScreen } from "./screens/Plan";
import { ProgressScreen } from "./screens/Progress";
import { progressFacts } from "./progress";
import { SelfCheckScreen } from "./screens/SelfCheck";
import { StartScreen } from "./screens/Start";
import { ToolkitScreen } from "./screens/Toolkit";
import { UnitScreen } from "./screens/Unit";
import { unitLabel } from "./screens/parts";
import { MemoryAnswerStore } from "./store";
import { isPendingFieldType, UnknownFieldError } from "./types";

export interface HarnessFailure {
  workbook: string;
  screen: string;
  field: string | null;
  error: string;
}

export interface HarnessResult {
  /** Screens rendered without throwing. */
  rendered: number;
  failures: HarnessFailure[];
  /** Week 3 placeholder fields met on the way. They count as a pass, kept separate. */
  pending: number;
  /** Per-screen markup sizes, for a quick sanity check of what rendered. */
  bytes: number;
}

const PENDING_ATTR = /data-pending-field="([a-z_]+)"/g;

/**
 * Render every screen of every workbook to static markup and collect what
 * throws. Units render both in full and in short mode, and each exercise is
 * also rendered on its own in both modes so a failure names the field.
 */
export function renderAll(workbooks: WorkbookV3[]): HarnessResult {
  const result: HarnessResult = { rendered: 0, failures: [], pending: 0, bytes: 0 };

  const attempt = (workbook: string, screen: string, make: () => ReactElement) => {
    try {
      const html = renderToStaticMarkup(make());
      result.rendered += 1;
      result.bytes += html.length;
      for (const m of html.matchAll(PENDING_ATTR)) {
        if (m[1] && isPendingFieldType(m[1])) result.pending += 1;
      }
    } catch (err) {
      const field = err instanceof UnknownFieldError ? err.fieldId : null;
      result.failures.push({ workbook, screen, field, error: err instanceof Error ? err.message : String(err) });
    }
  };

  for (const doc of workbooks) {
    const name = doc.slug;
    const store = new MemoryAnswerStore();
    const toolkitTitles = doc.toolkit.map((t) => t.title);
    const noop = () => undefined;

    attempt(name, "start", () => createElement(StartScreen, { workbook: doc, why: "", onWhyChange: noop, onAcknowledge: noop }));

    for (const unit of doc.units) {
      for (const mode of ["full", "short"] as const) {
        attempt(name, `unit:${unit.number}:${mode}`, () => createElement(UnitScreen, { workbook: doc, unit, store, mode, onExerciseDone: noop, onOpenCheckIn: noop, onOpenSelfCheck: noop }));
      }
    }

    for (const e of doc.exercises) {
      const modes = e.short_version ? (["full", "short"] as const) : (["full"] as const);
      for (const mode of modes) {
        attempt(name, `exercise:${e.id}:${mode}`, () => createElement(ExerciseScreen, { exercise: e, store, toolkitTitles, mode, onDone: noop }));
      }
    }

    attempt(name, "toolkit", () => createElement(ToolkitScreen, { toolkit: doc.toolkit, onUse: noop }));

    if (doc.daily_check) {
      const dc = doc.daily_check;
      attempt(name, "daily_check", () => createElement(DailyCheckScreen, { dailyCheck: dc, value: emptyDailyCheck(), onChange: noop, onSave: noop }));
    }

    if (doc.checkin) {
      const ci = doc.checkin;
      for (const short of [false, true]) {
        attempt(name, `checkin:${short ? "short" : "full"}`, () => createElement(CheckInScreen, { checkin: ci, unitNumber: 1, unitLabel: unitLabel(doc, 1), store, toolkitTitles, short, onSave: noop }));
      }
    }

    if (doc.selfcheck) {
      const sc = doc.selfcheck;
      attempt(name, "selfcheck", () => createElement(SelfCheckScreen, { selfcheck: sc, answers: {}, onChange: noop, onFinish: noop }));
    }

    attempt(name, "plan", () => createElement(PlanScreen, { workbook: doc, store }));
    attempt(name, "progress", () => createElement(ProgressScreen, { workbook: doc, facts: progressFacts(doc, [], store), events: [], onOpenStep: noop, onOpenPlan: noop }));
    attempt(name, "finish", () => createElement(FinishScreen, { workbook: doc, onOpenKeepGoing: noop, onOpenPlan: noop, onFinished: noop, buyHref: "/go/x" }));
    attempt(name, "keep_going", () => createElement(KeepGoingScreen, { workbook: doc, store, onOpenExercise: noop }));
  }

  return result;
}
