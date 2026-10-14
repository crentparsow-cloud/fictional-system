/**
 * The words for the autosave line (3.7), from the state model: one line in
 * one fixed spot, four states.
 *
 *   Unsaved changes            typed, not yet sent
 *   Saving                     on its way
 *   Saved just now             confirmed (for a minute, then plain "Saved")
 *   Couldn't save, retrying    with the cause, and a Retry button
 *
 * The other states (no consent, read only, device only) keep their own
 * wording, which says whose decision it is. Pure, so the words are tested.
 */

export type SaveStateName = "idle" | "unsaved" | "saving" | "saved" | "retrying" | "failed" | "consent" | "read_only" | "device" | "device_full";

/** Why a save did not go through, as the browser and the server told us. */
export type SaveCause = "offline" | "network" | "busy" | "slow" | "server";

export const CAUSE_TEXT: Record<SaveCause, string> = {
  offline: "You appear to be offline.",
  network: "We can't reach the server.",
  busy: "The server is busy.",
  slow: "The server was slow to answer.",
  server: "The server had a problem.",
};

/** The cause for a failed request. `status` is absent when the request itself threw. */
export function causeFor(status: number | undefined, online: boolean | undefined): SaveCause {
  if (status === undefined) return online === false ? "offline" : "network";
  if (status === 429) return "busy";
  if (status === 408) return "slow";
  return "server";
}

export interface SaveLineInput {
  state: SaveStateName;
  cause?: SaveCause | null;
  /** When the last save was confirmed, in milliseconds. */
  savedAt?: number | null;
  now?: number;
  /** The reader's latest words are also held on this device. */
  keptOnDevice?: boolean;
}

export interface SaveLine {
  text: string;
  /** Show the Retry button. */
  retry: boolean;
  tone: "quiet" | "warn";
}

const JUST_NOW_MS = 60_000;

export function saveLine({ state, cause, savedAt, now = Date.now(), keptOnDevice = false }: SaveLineInput): SaveLine {
  switch (state) {
    case "idle":
      return { text: "", retry: false, tone: "quiet" };
    case "unsaved":
      return { text: "Unsaved changes", retry: false, tone: "quiet" };
    case "saving":
      return { text: "Saving", retry: false, tone: "quiet" };
    case "saved":
      return { text: savedAt != null && now - savedAt > JUST_NOW_MS ? "Saved" : "Saved just now", retry: false, tone: "quiet" };
    case "retrying": {
      const why = cause ? ` ${CAUSE_TEXT[cause]}` : "";
      const kept = keptOnDevice ? " Your latest words are kept on this device." : "";
      return { text: `Couldn't save, retrying.${why}${kept}`, retry: true, tone: "warn" };
    }
    case "failed":
      return { text: "Couldn't save this answer. The server refused it, so trying again will not help.", retry: false, tone: "warn" };
    case "consent":
      return { text: "Not saved. Consent to store your answers is not in place.", retry: false, tone: "warn" };
    case "read_only":
      return { text: "Not saved. Your account is read only while its deletion is pending.", retry: false, tone: "warn" };
    case "device":
      return { text: "Kept on this device. Sign in to save it to your account.", retry: false, tone: "quiet" };
    case "device_full":
      return { text: "This device has no room, so your latest answer is not being kept. Sign in to save it.", retry: false, tone: "warn" };
  }
}
