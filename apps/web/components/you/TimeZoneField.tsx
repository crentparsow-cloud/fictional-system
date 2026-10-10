"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const browserZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

/**
 * The time zone for reminders, in plain words, kept in a hidden field. A
 * reader who has not chosen one yet gets the browser's own; once saved, the
 * saved zone is kept.
 */
export function TimeZoneField({ id, defaultValue, saved }: { id: string; defaultValue: string; saved: boolean }) {
  const own = useSyncExternalStore(subscribe, browserZone, () => null);
  const zone = !saved && own ? own : defaultValue;
  return (
    <>
      <input type="hidden" name="timezone" value={zone} />
      <p className="small muted" id={id}>
        Time zone: {zone.replace(/_/g, " ")}
      </p>
    </>
  );
}
