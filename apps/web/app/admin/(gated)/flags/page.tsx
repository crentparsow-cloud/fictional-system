import type { Metadata } from "next";
import Link from "next/link";
import { COHORT_FLAGS, FLAG_LABELS, rolloutLine } from "@/lib/platform/flags";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { saveFlag } from "./actions";

export const metadata: Metadata = { title: "Feature flags", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  saved: "Saved. The change is in the audit log.",
  denied: "Only platform owners can change flags.",
  invalid: "That value was not accepted. Use a whole number from 0 to 100.",
  failed: "It could not be saved just now. Try again.",
};

/**
 * Feature flags per cohort (10.5). Each flag is off until an owner switches
 * it on, and can then be opened to a share of signed-in readers. A reader's
 * place is fixed by their id, so raising the number only adds people.
 */
export default async function FlagsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const staff = await getStaffSession("/admin/flags");
  const canEdit = staff.roles.includes("owner");
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("feature_flags")
    .select("key, enabled, rollout_percent, reason, updated_at")
    .eq("scope", "global")
    .in("key", [...COHORT_FLAGS]);
  const rows = new Map(((data ?? []) as { key: string; enabled: boolean; rollout_percent: number; reason: string | null; updated_at: string }[]).map((r) => [r.key, r]));

  return (
    <section className="admin-page">
      <p className="eyebrow">
        <Link href="/admin">Staff home</Link>
      </p>
      <h1>Feature flags</h1>
      <p className="muted">Every flag starts off. Switch one on, then open it to a share of readers. Readers keep their place as the share grows.</p>
      {notice ? (
        <p className="you-notice" role="status">
          {notice}
        </p>
      ) : null}
      {COHORT_FLAGS.map((key) => {
        const row = rows.get(key);
        const state = { enabled: row?.enabled === true, rolloutPercent: row ? Number(row.rollout_percent) : 0 };
        return (
          <form key={key} action={saveFlag} className="card admin-flag">
            <input type="hidden" name="key" value={key} />
            <h2>{FLAG_LABELS[key].name}</h2>
            <p className="muted">{FLAG_LABELS[key].line}</p>
            <p>
              <strong>{rolloutLine(state)}</strong>
            </p>
            <p>
              <label>
                <input type="checkbox" name="enabled" defaultChecked={state.enabled} disabled={!canEdit} /> On
              </label>
            </p>
            <p>
              <label htmlFor={`pc-${key}`}>Share of readers, percent</label>
              <input id={`pc-${key}`} name="percent" type="number" min={0} max={100} step={1} defaultValue={state.rolloutPercent} disabled={!canEdit} inputMode="numeric" />
            </p>
            <p>
              <label htmlFor={`rs-${key}`}>Why (kept in the audit log)</label>
              <input id={`rs-${key}`} name="reason" type="text" maxLength={200} disabled={!canEdit} />
            </p>
            {canEdit ? (
              <button type="submit" className="btn">
                Save
              </button>
            ) : (
              <p className="muted">Platform owners can change this.</p>
            )}
          </form>
        );
      })}
    </section>
  );
}
