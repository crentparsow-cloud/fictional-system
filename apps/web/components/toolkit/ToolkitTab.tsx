"use client";

import { useCallback, useState } from "react";
import { ToolkitCardView, type ToolkitCard } from "@akana/engine";

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
export function ToolkitTab({ groups }: { groups: ToolkitGroup[] }) {
  const [used, setUsed] = useState<string | null>(null);
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
              <ToolkitCardView key={t.id} tool={t} onUse={(id) => record(g.enrolmentId, id)} used={used === `${g.enrolmentId}:${t.id}`} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
