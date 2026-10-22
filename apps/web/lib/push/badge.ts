/**
 * The app badge count (14.7). One means a step is waiting today. Zero clears
 * it. Never a count of days or missed steps, and zero for any reader who has a
 * workbook above safety tier none, so nothing counts on those shelves.
 */
export function badgeCount(i: { wellbeing: boolean; stepWaiting: boolean; finishedToday: boolean }): 0 | 1 {
  if (i.wellbeing || !i.stepWaiting || i.finishedToday) return 0;
  return 1;
}
