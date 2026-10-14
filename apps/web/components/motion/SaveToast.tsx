import { SAVE_TOAST_WORDS } from "@/lib/motion";

/**
 * The save toast (plan 1.6): two words, one fixed spot above the tabs, polite
 * announcement, no modal. Render it when a save finishes; it fades by itself.
 * The live region stays mounted so screen readers pick up the change.
 * `inline` draws it in the page flow without the fade, for /dev/kit.
 */
export function SaveToast({ state, inline = false }: { state: "idle" | "saved" | "failed"; inline?: boolean }) {
  const words = state === "saved" ? SAVE_TOAST_WORDS.saved : state === "failed" ? SAVE_TOAST_WORDS.failed : "";
  return (
    <div className="save-toast" data-inline={inline ? "true" : undefined} role="status" aria-live="polite">
      {words ? <span key={state}>{words}</span> : null}
    </div>
  );
}
