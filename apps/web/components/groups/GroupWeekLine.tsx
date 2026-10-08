import Link from "next/link";
import { groupWeekLine, type MyGroup } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

/**
 * "Your group is on week 3" on Home and Today (F-211). One line per group
 * the reader is in, a waiting leader appointment, and a quiet line when a
 * group they could join exists. Shows nothing for anyone with no seat.
 * Never a streak, never "behind".
 */
export async function GroupWeekLine() {
  const supabase = await createUserClient();
  const [mine, joinable] = await Promise.all([supabase.rpc("my_org_groups"), supabase.rpc("my_joinable_org_groups")]);
  const groups = ((mine.data ?? []) as MyGroup[]).filter((g) => g.status !== "finished");
  const canJoin = ((joinable.data ?? []) as unknown[]).length;
  if (groups.length === 0 && canJoin === 0) return null;
  return (
    <section className="card group-week-card" aria-labelledby="group-week-h">
      <h2 id="group-week-h" className="group-week-title">
        Your groups
      </h2>
      <ul className="group-week-list">
        {groups.map((g) => (
          <li key={g.group_id}>
            <Link href="/groups">
              {g.offered_role && !g.accepted ? `${g.group_name}: you have been asked to lead` : `${g.group_name}: ${groupWeekLine(g.current_week, g.current_unit)}`}
            </Link>
          </li>
        ))}
        {groups.length === 0 && canJoin > 0 ? (
          <li>
            <Link href="/groups">Your organisation has a group you can join</Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
