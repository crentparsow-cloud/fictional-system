import type { Metadata } from "next";
import { WorkbookV3, stripInternal } from "@akana/schema";
import "@akana/engine/engine.css";
import focus from "../../../../../content/workbooks/v3/focus.json";
import { PlayerClient } from "./PlayerClient";

export const metadata: Metadata = {
  title: "Player preview",
  robots: { index: false, follow: false },
};

/**
 * Development preview of the engine (F-015). The workbook is read at build
 * time and the internal block is stripped before it reaches the client.
 * Answers live in memory only.
 */
export default function DevPlayerPage() {
  const workbook = WorkbookV3.parse(stripInternal(focus as Parameters<typeof stripInternal>[0]));
  return (
    <main className="wrap" style={{ paddingBlock: "1.5rem" }}>
      <p className="badge demo" role="note" style={{ marginBlockEnd: "1rem" }}>
        Development preview. Answers are not saved.
      </p>
      <PlayerClient workbook={workbook} />
    </main>
  );
}
