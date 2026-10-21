/**
 * Milestone marks (build list 4.5): first step, first week, first programme,
 * first shelf. The database decides when one is earned (award_milestones,
 * migration 0050). A mark holds a kind and a time. It never holds a title, a
 * shelf name or an answer, and neither does the picture made from it.
 */

export const MILESTONE_KINDS = ["first_step", "first_week", "first_programme", "first_shelf"] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export interface MilestoneCopy {
  /** Short name of the mark. */
  name: string;
  /** One quiet sentence shown with it. */
  line: string;
  /** What the shared picture says, under the name. No title, no answer. */
  imageLine: string;
}

export const MILESTONE_COPY: Record<MilestoneKind, MilestoneCopy> = {
  first_step: {
    name: "First step",
    line: "You finished your first step.",
    imageLine: "Finished a first step.",
  },
  first_week: {
    name: "First week",
    line: "You finished your first week.",
    imageLine: "Finished a first week.",
  },
  first_programme: {
    name: "First programme",
    line: "You finished your first programme.",
    imageLine: "Finished a first programme.",
  },
  first_shelf: {
    name: "First shelf",
    line: "You finished several programmes on one shelf.",
    imageLine: "Finished a shelf of programmes.",
  },
};

export function isMilestoneKind(v: unknown): v is MilestoneKind {
  return typeof v === "string" && (MILESTONE_KINDS as readonly string[]).includes(v);
}

export interface MarkRow {
  id: string;
  kind: string;
  earned_at: string;
  seen_at: string | null;
}

export interface MarkView {
  id: string;
  kind: MilestoneKind;
  name: string;
  line: string;
  isNew: boolean;
}

/** Marks in the order a reader earned them. Unknown kinds are dropped. */
export function marksView(rows: readonly MarkRow[]): MarkView[] {
  const order = new Map(MILESTONE_KINDS.map((k, i) => [k as string, i]));
  return rows
    .filter((r): r is MarkRow & { kind: MilestoneKind } => isMilestoneKind(r.kind))
    .sort((a, b) => (order.get(a.kind)! - order.get(b.kind)!))
    .map((r) => ({ id: r.id, kind: r.kind, name: MILESTONE_COPY[r.kind].name, line: MILESTONE_COPY[r.kind].line, isNew: r.seen_at === null }));
}

/** The file name for a saved picture. It carries the kind and nothing about the reader. */
export function imageFileName(kind: MilestoneKind): string {
  return `akana-${kind.replace(/_/g, "-")}.png`;
}
