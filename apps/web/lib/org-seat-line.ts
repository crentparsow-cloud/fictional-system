/**
 * The "Your organisation" line on Home (F-201 to F-205 follow-on). Built
 * from public.my_org_seats() (0024): the reader's own unreleased seats. Only
 * the organisation's display name is ever shown, and only for a live
 * licence. Nothing about the licence, the dates or other members.
 */
export interface OrgSeatRow {
  organisation_name: string | null;
  live: boolean | null;
}

/** Distinct display names of live seats, in order. Empty when there are none. */
export function liveOrganisationNames(rows: readonly OrgSeatRow[] | null | undefined): string[] {
  const names = new Set<string>();
  for (const r of rows ?? []) {
    const name = typeof r.organisation_name === "string" ? r.organisation_name.trim() : "";
    if (r.live === true && name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en-GB"));
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
