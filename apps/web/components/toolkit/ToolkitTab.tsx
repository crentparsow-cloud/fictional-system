"use client";

import { useCallback, useState } from "react";
import { ToolkitCardView, type ToolkitCard } from "@akana/engine";
import { setSavedTool } from "@/app/(reader)/today/actions";

export interface ToolkitGroup {
  enrolmentId: string;
  title: string;
  slug: string;
  cards: ToolkitCard[];
}

/**
 * The Toolkit tab: the tools from every open workbook, one group each, the
 * most recent first and open. Breathing tools carry the pacer. "I used it"
 * records a toolkit_used event (the tool id and a time, nothing else) and
 * shows no count.
 */
export function ToolkitTab({ groups, saved: savedKeys = [], readOnly = false }: { groups: ToolkitGroup[]; saved?: string[]; readOnly?: boolean }) {
  const [used, setUsed] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set(savedKeys));
  const [failed, setFailed] = useState<string | null>(null);
  const toggle = useCallback(async (enrolmentId: string, toolId: string) => {
    const key = `${enrolmentId}:${toolId}`;
    const want = !saved.has(key);
    setFailed(null);
    if (await setSavedTool(enrolmentId, toolId, want)) {
      setSaved((prev) => {
        const next = new Set(prev);
        if (want) next.add(key);
        else next.delete(key);
        return next;
      });
    } else setFailed(key);
  }, [saved]);
  const record = useCallback((enrolmentId: string, toolId: string) => {
    setUsed(`${enrolmentId}:${toolId}`);
    void fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enrolment: enrolmentId, kind: "toolkit_used", ref: toolId }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  return (
    <div className="toolkit-groups">
      {groups.map((g, i) => (
        <details key={g.enrolmentId} className="card toolkit-group" open={i === 0}>
          <summary>
            <span>{g.title}</span>
            <span className="muted small">
              {g.cards.length} {g.cards.length === 1 ? "tool" : "tools"}
            </span>
          </summary>
          <div className="toolkit-cards">
            {g.cards.map((t) => (
              <div key={t.id}>
                <ToolkitCardView tool={t} onUse={(id) => record(g.enrolmentId, id)} used={used === `${g.enrolmentId}:${t.id}`} />
                {readOnly ? null : (
                  <p>
                    <button type="button" className="linklike" aria-pressed={saved.has(`${g.enrolmentId}:${t.id}`)} onClick={() => void toggle(g.enrolmentId, t.id)}>
                      {saved.has(`${g.enrolmentId}:${t.id}`) ? "Saved for Today. Remove" : "Save for Today"}
                    </button>
                    {failed === `${g.enrolmentId}:${t.id}` ? <span className="muted small"> That did not save just now.</span> : null}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
