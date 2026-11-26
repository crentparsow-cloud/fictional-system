import type { Metadata } from "next";
import { WorkbookV3, stripInternal } from "@akana/schema";
import "@akana/engine/engine.css";
import focus from "../../../../../content/workbooks/v3/focus.json";
import { requireKitPage } from "@/lib/design/kit-gate";
import { PlayerClient } from "./PlayerClient";

export const metadata: Metadata = {
  title: "Player preview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Development preview of the engine (F-015). The workbook is read at build
 * time and the internal block is stripped before it reaches the client.
 * Answers live in memory only. Same gate as /dev/kit: staff only in
 * production, open elsewhere.
 */
export default async function DevPlayerPage() {
  await requireKitPage("/dev/player");
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
