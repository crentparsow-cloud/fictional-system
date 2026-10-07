"use client";

import { useSyncExternalStore } from "react";

/**
 * The legacy app's evening line: after 9 p.m. and before 5 a.m. on the
 * reader's own clock, Today says nothing is required. Worked out on the
 * device, so the server never needs the reader's time zone.
 */
const subscribe = () => () => undefined;
const isNight = () => {
  const h = new Date().getHours();
  return h >= 21 || h < 5;
};

export function NightNote() {
  const night = useSyncExternalStore(subscribe, isNight, () => false);
  if (!night) return null;
  return <p className="note night-note">Nothing is required tonight. One small thing, if you want.</p>;
}
