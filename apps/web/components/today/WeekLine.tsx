/**
 * "Week 3 of 8. Two steps this week." (4.2). A line, not a counter. When a
 * step has been finished this calendar week with its fields filled, the week
 * carries a quiet mark. There is no streak, no run of weeks and no total.
 */
export function WeekLine({ line, marked }: { line: string; marked: boolean }) {
  return (
    <p className="week-line" data-testid="week-line">
      <span>{line}</span>
      {marked ? <span className="muted"> This week is marked.</span> : null}
    </p>
  );
}
