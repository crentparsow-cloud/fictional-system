"use client";

import { useEffect, useState } from "react";
import { splitFieldKey } from "@/lib/answer-fields";
import { deviceDrafts, tryBucket } from "@/lib/draft-store";
import type { FieldValue } from "@akana/engine";
import type { SupabaseAnswerStore } from "./AnswerStore";
import { planTransfer } from "./draft-transfer";

/**
 * Offered once a visitor who tried the first unit has signed in (5.2): the
 * answers written on this device, "Save them to your account?" Saving writes
 * each through the ordinary store, so the server seals it, and then clears
 * the device copy. Declining clears it too. "Not now" leaves it for next time.
 * Nothing is saved without a tap.
 */
export function DraftTransfer({ slug, store }: { slug: string; store: SupabaseAnswerStore }) {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState<"saved" | "cleared" | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void deviceDrafts()
      .list(tryBucket(slug))
      .then((recs) => {
        if (cancelled) return;
        setCount(planTransfer(recs, (scope, field) => store.get(scope, field) !== undefined).apply.length);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, store]);

  if (hidden || (count === 0 && !done)) return null;

  async function save() {
    const drafts = deviceDrafts();
    const plan = planTransfer(await drafts.list(tryBucket(slug)), (scope, field) => store.get(scope, field) !== undefined);
    for (const rec of plan.apply) {
      const parts = splitFieldKey(rec.field);
      if (parts) store.set(parts.scope, parts.fieldId, rec.value as FieldValue);
    }
    store.flush();
    await drafts.clearBucket(tryBucket(slug));
    setDone("saved");
    setCount(0);
  }

  async function discard() {
    await deviceDrafts().clearBucket(tryBucket(slug));
    setDone("cleared");
    setCount(0);
  }

  if (done) {
    return (
      <p className="draft-transfer muted" role="status">
        {done === "saved" ? "Your answers are saved to your account." : "The answers on this device have been deleted."}
      </p>
    );
  }

  return (
    <section className="card draft-transfer" aria-labelledby="draft-transfer-title">
      <h2 id="draft-transfer-title">Save your answers?</h2>
      <p>
        You wrote {count === 1 ? "1 answer" : `${count} answers`} on this device before you signed in. Save {count === 1 ? "it" : "them"} to your account so {count === 1 ? "it is" : "they are"} kept safely.
      </p>
      <div className="draft-transfer-actions">
        <button type="button" className="btn" onClick={() => void save()}>
          Save to my account
        </button>
        <button type="button" className="btn secondary" onClick={() => setHidden(true)}>
          Not now
        </button>
        <button type="button" className="btn secondary" onClick={() => void discard()}>
          Delete from this device
        </button>
      </div>
    </section>
  );
}
