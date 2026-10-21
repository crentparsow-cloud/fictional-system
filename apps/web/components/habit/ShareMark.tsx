"use client";

import { useState } from "react";

/**
 * Saves or shares the picture for a milestone mark. The picture is made on
 * the server from the mark's kind alone and carries no answer. The reader
 * chooses to share it; nothing is posted for them, and the browser's own
 * share sheet is used where it exists.
 */
export function ShareMark({ id, fileName, name }: { id: string; fileName: string; name: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

  async function go() {
    setState("busy");
    try {
      const res = await fetch(`/api/milestones/${id}/image`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("image");
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setState("idle");
    } catch (e) {
      // Closing the share sheet is not a failure.
      setState(e instanceof DOMException && e.name === "AbortError" ? "idle" : "failed");
    }
  }

  return (
    <>
      <button type="button" className="btn secondary" onClick={go} disabled={state === "busy"}>
        Save or share picture
      </button>
      {state === "failed" ? (
        <span role="status" className="small muted">
          The picture could not be made. Please try again.
        </span>
      ) : null}
    </>
  );
}
