"use client";

import { useEffect, useState } from "react";
import { paragraphRef, screenRef, normaliseText, type Paragraph } from "@/lib/reading/marks";

export interface Para extends Paragraph {
  el: HTMLElement;
  visible: boolean;
}

export interface Scan {
  screen: string;
  paras: Para[];
  /** The step on the open screen when it is the first page of an exercise: its id and title. Null otherwise. */
  step: { ref: string; title: string } | null;
}

const EMPTY: Scan = { screen: "", paras: [], step: null };

/** Reads the paragraphs of the open screen: only text the workbook marked as reading, never a field or an answer. */
export function scanScreen(root: HTMLElement): Scan {
  const s = root.querySelector<HTMLElement>(".ak-screen");
  if (!s) return EMPTY;
  const screen = screenRef({ screen: s.classList[1] ?? null, unit: s.dataset.unit ?? null, exercise: s.dataset.exercise ?? null, page: s.dataset.page ?? null });
  const paras: Para[] = [];
  s.querySelectorAll<HTMLElement>("[data-ra]").forEach((el, i) => {
    paras.push({ ref: paragraphRef(screen, i), el, text: normaliseText(el.textContent ?? ""), visible: el.getClientRects().length > 0 });
  });
  const page = s.dataset.page;
  const step =
    s.classList.contains("ak-exercise") && s.dataset.exercise && (!page || page === "purpose")
      ? { ref: s.dataset.exercise, title: (s.querySelector<HTMLElement>(".ak-h2")?.textContent ?? "").trim() }
      : null;
  return { screen, paras, step };
}

const same = (a: Scan, b: Scan) =>
  a.screen === b.screen &&
  a.step?.ref === b.step?.ref &&
  a.paras.length === b.paras.length &&
  a.paras.every((p, i) => p.el === b.paras[i]!.el && p.visible === b.paras[i]!.visible);

/** The paragraphs on the open screen, kept current as the reader moves between screens. */
export function useParagraphs(stage: React.RefObject<HTMLElement | null>): Scan {
  const [scan, setScan] = useState<Scan>(EMPTY);

  useEffect(() => {
    const root = stage.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rescan = () => {
      const body = root.querySelector<HTMLElement>(".ak-player-body");
      if (!body) return;
      const next = scanScreen(body);
      setScan((prev) => (same(prev, next) ? prev : next));
    };
    const first = setTimeout(rescan, 0);
    const watch = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(rescan, 150);
    });
    watch.observe(root, { childList: true, subtree: true });
    return () => {
      clearTimeout(first);
      watch.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [stage]);

  return scan;
}
