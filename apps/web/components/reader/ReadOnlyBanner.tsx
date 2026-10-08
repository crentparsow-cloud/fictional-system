import Link from "next/link";
import type { DeletionState } from "@/lib/account";
import { readOnlyBanner } from "@/lib/account";

/**
 * Shown across the reader tabs while an account deletion is pending (F-025).
 * The work stays readable and downloadable; nothing new can be added.
 */
export function ReadOnlyBanner({ state }: { state: DeletionState }) {
  const words = readOnlyBanner(state);
  if (!words) return null;
  return (
    <div className="read-only-banner" role="region" aria-label="Read only">
      <p>
        <b>{words.title}</b>
      </p>
      <p className="small">{words.body}</p>
      {state.kind === "pending" ? (
        <p className="small">
          <Link href="/you">Go to You to cancel the deletion</Link>
        </p>
      ) : null}
    </div>
  );
}
