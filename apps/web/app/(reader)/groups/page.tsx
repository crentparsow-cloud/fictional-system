import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { GroupCalendarFile } from "@/components/groups/GroupCalendarFile";
import { GroupNoticeLine } from "@/components/org/GroupBits";
import { getReaderSession } from "@/lib/auth";
import { CHECKIN_CHOICES, CHECKIN_LABELS, groupWeekLine, meetingText, type MyGroup } from "@/lib/org-groups";
import { groupSchedule, type ScheduleRow } from "@/lib/org-groups-server";
import { createUserClient } from "@/lib/supabase/server";
import { checkIn, clearCheckins, declineOffer, joinGroup, leaveGroup, setCounting } from "./actions";

export const metadata: Metadata = { title: "Groups", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;


interface Joinable {
  group_id: string;
  group_name: string;
  organisation_name: string;
  organisation_kind: string;
  workbook_title: string;
  status: string;
  faith: boolean;
  meeting_day: number | null;
  meeting_time: string | null;
}

/**
 * The member's groups (F-210, F-211, F-213, F-215, F-216). Which week the
 * group is on, a fixed-choice check-in, whether it counts in the totals,
 * and a way to raise a concern with Akana. There is no member list and no
 * way to message anyone. Nothing here is locked by the group's pace.
 */
export default async function GroupsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/groups")}`);
  const supabase = await createUserClient();
  const [mineRes, joinRes] = await Promise.all([supabase.rpc("my_org_groups"), supabase.rpc("my_joinable_org_groups")]);
  if (mineRes.error) console.error("my_org_groups_failed", mineRes.error.code ?? "");
  const mine = (mineRes.data ?? []) as MyGroup[];
  const joinable = (joinRes.data ?? []) as Joinable[];
  // F-211: the unit dates for the calendar file, for groups the member has joined. RLS (0028) limits the rows to their groups.
  const schedules = new Map<string, ScheduleRow[]>(
    await Promise.all(mine.filter((g) => g.accepted && g.status !== "archived").map(async (g) => [g.group_id, await groupSchedule(g.group_id)] as const)),
  );
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <section className="tab-page groups-page">
      <div className="page-head">
        <h1>Groups</h1>
        <HelpNowButton />
      </div>
      <GroupNoticeLine code={sp.notice} />
      <p className="muted">
        A group follows one workbook together. What you write stays private: nobody in the group, its leader or your organisation can read
        it. Other members cannot see your details, and you cannot message each other here.
      </p>

      {mine.length === 0 && joinable.length === 0 ? (
        <div className="card empty-state">
          <p>You are not in a group. If your organisation runs one, it will show here.</p>
        </div>
      ) : null}

      {mine.map((g) => {
        const meets = meetingText(g.meeting_day, g.meeting_time);
        const leaderRole = g.role === "leader" || g.role === "co_leader";
        const offer = g.offered_role === "leader" || g.offered_role === "co_leader" ? g.offered_role : null;
        return (
          <article key={g.group_id} className="card group-card" aria-labelledby={`g-${g.group_id}`}>
            <h2 id={`g-${g.group_id}`}>{g.group_name}</h2>
            <p className="muted">
              {g.organisation_name}
              {meets ? `. Meets ${meets.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}.
            </p>

            {offer ? (
              <div className="group-offer">
                <p>
                  {g.organisation_name} has asked you to be the {offer === "leader" ? "leader" : "co-leader"} of this group. A leader sees how
                  many have joined, the schedule, check-in totals and a facilitator guide. Never anyone&apos;s answers or details.
                </p>
                {g.faith && !g.accepted ? <p className="muted small">This group asks for your faith consent first.</p> : null}
                <form action={joinGroup}>
                  {hidden("group", g.group_id)}
                  <button type="submit" className="btn">
                    Accept
                  </button>
                </form>
                <form action={declineOffer}>
                  {hidden("group", g.group_id)}
                  <button type="submit" className="btn secondary">
                    No, thank you
                  </button>
                </form>
              </div>
            ) : null}
            {!g.accepted ? null : (
              <>
                <p className="group-week">
                  <strong>{groupWeekLine(g.current_week, g.current_unit)}</strong>
                </p>
                <p>
                  <Link href={`/read/${g.workbook_slug}`}>Open {g.workbook_title}</Link>. You can read ahead or catch up at your own pace.
                </p>
                <GroupCalendarFile units={schedules.get(g.group_id) ?? []} workbookTitle={g.workbook_title} />
                {leaderRole ? (
                  <p>
                    <Link href={`/org/lead/${g.group_id}`} className="btn secondary">
                      Open the leader view
                    </Link>
                  </p>
                ) : null}

                {g.status === "running" && g.current_unit ? (
                  <form action={checkIn} className="group-checkin">
                    {hidden("group", g.group_id)}
                    {hidden("unit", String(g.current_unit))}
                    <fieldset>
                      <legend>How was this week? (optional)</legend>
                      {CHECKIN_CHOICES.map((c) => (
                        <div key={c} className="check group-choice">
                          <input id={`c-${g.group_id}-${c}`} type="radio" name="choice" value={c} defaultChecked={g.my_choice === c} required />
                          <label htmlFor={`c-${g.group_id}-${c}`}>{CHECKIN_LABELS[c]}</label>
                        </div>
                      ))}
                    </fieldset>
                    <button type="submit" className="btn secondary">
                      {g.my_choice ? "Change my check-in" : "Check in"}
                    </button>
                    <p className="muted small">
                      {g.count_checkins
                        ? "Your answer counts in the group's totals. The leader sees how many chose each answer, never who, and nothing until at least 5 have counted."
                        : "Your answer is kept for you only. It does not count in the group's totals."}
                    </p>
                  </form>
                ) : null}

                <details className="group-more">
                  <summary>Your choices for this group</summary>
                  <form action={setCounting}>
                    {hidden("group", g.group_id)}
                    {hidden("count", g.count_checkins ? "no" : "yes")}
                    <button type="submit" className="btn secondary">
                      {g.count_checkins ? "Stop counting my check-ins in the totals" : "Count my check-ins in the group's totals"}
                    </button>
                  </form>
                  <form action={clearCheckins} className="studio-inline-confirm">
                    {hidden("group", g.group_id)}
                    <div className="check">
                      <input id={`clear-${g.group_id}`} name="confirm" type="checkbox" value="yes" required />
                      <label htmlFor={`clear-${g.group_id}`}>Delete my check-ins for this group</label>
                    </div>
                    <button type="submit" className="btn secondary">
                      Delete
                    </button>
                  </form>
                  <form action={leaveGroup} className="studio-inline-confirm">
                    {hidden("group", g.group_id)}
                    <div className="check">
                      <input id={`leave-${g.group_id}`} name="confirm" type="checkbox" value="yes" required />
                      <label htmlFor={`leave-${g.group_id}`}>Leave this group</label>
                    </div>
                    <button type="submit" className="btn secondary">
                      Leave
                    </button>
                  </form>
                  <p className="muted small">Leaving keeps your seat, your workbook and everything you wrote.</p>
                </details>
              </>
            )}

            <p className="small">
              <Link href={`/groups/concern?group=${g.group_id}`}>Report a concern about this group</Link>
            </p>
          </article>
        );
      })}

      {joinable.length > 0 ? (
        <section aria-labelledby="joinable-h">
          <h2 id="joinable-h" className="section-title">
            Groups you can join
          </h2>
          {joinable.map((g) => {
            const meets = meetingText(g.meeting_day, g.meeting_time);
            return (
              <article key={g.group_id} className="card group-card" aria-labelledby={`j-${g.group_id}`}>
                <h3 id={`j-${g.group_id}`}>{g.group_name}</h3>
                <p className="muted">
                  {g.organisation_name}. {g.workbook_title}.{meets ? ` Meets ${meets}.` : ""}
                </p>
                {g.faith ? (
                  <p className="muted small">
                    Joining this group can show your religious beliefs, so we ask for your explicit consent first. You can withdraw it in You.
                  </p>
                ) : null}
                <form action={joinGroup}>
                  {hidden("group", g.group_id)}
                  <button type="submit" className="btn">
                    Join this group
                  </button>
                </form>
              </article>
            );
          })}
          <p className="muted small">Joining is your choice. Your organisation sees how many have joined once there are at least 5, never who.</p>
        </section>
      ) : null}
    </section>
  );
}
