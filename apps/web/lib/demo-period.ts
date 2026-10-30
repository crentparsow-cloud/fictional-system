/**
 * Demo period switch (Crent, 30 October 2026). While on, every part of a demo
 * title (workbooks.is_demo, badge "demo") opens to any signed-in reader with
 * no purchase or membership. Demos stay unbuyable, keep the Demo badge,
 * and anonymous readers still try only the free first part.
 *
 * The gate itself is the workbook_sections_read policy, switched by
 * app.demo_fully_open() in supabase/migrations/0070_demo_fully_open.sql. This
 * mirror keeps the paywall card in step with it. Turn both off together.
 */
export function demoFullyOpen(): boolean {
  // demo period, remove before launch
  return true;
}
