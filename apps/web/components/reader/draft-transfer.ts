import { splitFieldKey } from "@/lib/answer-fields";
import type { DraftRecord } from "@/lib/draft-store";

/**
 * Which answers kept on the device before sign-in are offered to the account
 * (5.2). A draft is applied only to a field the account has nothing in yet:
 * what the server already holds is the sealed copy and wins, so signing in
 * on a second device can never overwrite earlier work. A draft that is not a
 * valid answer path is ignored.
 */
export interface TransferPlan {
  /** Drafts to write into the account. */
  apply: DraftRecord[];
  /** Drafts the account already has an answer for. */
  keptServerCopy: number;
}

export function planTransfer(drafts: readonly DraftRecord[], has: (scope: string, fieldId: string) => boolean): TransferPlan {
  const apply: DraftRecord[] = [];
  let keptServerCopy = 0;
  for (const rec of drafts) {
    const parts = splitFieldKey(rec.field);
    if (!parts) continue;
    if (has(parts.scope, parts.fieldId)) keptServerCopy += 1;
    else apply.push(rec);
  }
  return { apply, keptServerCopy };
}
