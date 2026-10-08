import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupNoticeLine, ScheduleEditor } from "@/components/org/GroupBits";
import { labelOf } from "@/lib/org-pilot";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { DAY_LABELS, GROUP_STATUS_LABELS, groupCountText, isUuidLike, LEADER_STATE_LABELS, nextStatuses, weekShort } from "@/lib/org-groups";
import { groupSchedule, groupUnits } from "@/lib/org-groups-server";
import { createUserClient } from "@/lib/supabase/server";
import { appointLeader, saveScheduleAsOwner, unappointLeader, updateGroup } from "../actions";

export const metadata: Metadata = { title: "Group", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

interface GroupRow {
  group_id: string;
  licence_id: string;
  group_name: string;
  workbook_title: string;
  status: string;
  faith: boolean;
  starts_on: string | null;
  meeting_day: number | null;
  meeting_time: string | null;
  members: number | null;
  members_shown: string;
  leader_state: string;
  co_leader_state: string;
  current_unit: number | null;
  current_week: number | null;
  scheduled_units: number;
  threshold: number;
}

interface Seat {
  seat_id: string;
  roster_email: string | null;
}

/**
 * One group, for the owner (F-210, F-211). Name, meeting time, status,
 * leaders and the schedule. The leader and co-leader are chosen from the
 * licence's seat holders, by the address the organisation invited; the
 * person accepts in their own app. The owner never sees who else joined.
 */
export default async function OrgGroupPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuidLike(id)) notFound();
  const ctx = await requireOrgConsole(`/org/groups/${id}`, sp.org);
  if (ctx.org.role !== "owner") notFound();
  const supabase = await createUserClient();
  const list = await supabase.rpc("org_group_list", { p_org: ctx.org.id });
  const g = ((list.data ?? []) as GroupRow[]).find((r) => r.group_id === id);
  if (!g) notFound();

  const open = g.status === "draft" || g.status === "running";
  const [units, schedule, roster] = await Promise.all([
    groupUnits(g.group_id),
    groupSchedule(g.group_id),
    open ? supabase.rpc("org_seat_roster", { p_licence: g.licence_id }) : Promise.resolve({ data: [] }),
  ]);
  const seats = ((roster.data ?? []) as Seat[]).filter((s) => s.roster_email);
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const back = withOrgParam("/org/groups", ctx.org.id, ctx.multi);
  const moves = nextStatuses(g.status);

  return (
    <div className="admin-page studio-page org-console">
      <p>
        <Link href={back}>All groups</Link>
      </p>
      <h1>{g.group_name}</h1>
      <GroupNoticeLine code={sp.notice} />
      <dl className="admin-dl">
        <div>
          <dt>Workbook</dt>
          <dd>{g.workbook_title}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{labelOf(GROUP_STATUS_LABELS, g.status)}</dd>
        </div>
        <div>
          <dt>Where it is</dt>
          <dd>{g.scheduled_units === 0 ? "No schedule yet" : weekShort(g.current_week, g.current_unit)}</dd>
        </div>
        <div>
          <dt>Members</dt>
          <dd>{groupCountText(g.members_shown, g.members, g.threshold)}</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd>{labelOf(LEADER_STATE_LABELS, g.leader_state)}</dd>
        </div>
        <div>
          <dt>Co-leader</dt>
          <dd>{labelOf(LEADER_STATE_LABELS, g.co_leader_state)}</dd>
        </div>
        {g.faith ? (
          <div>
            <dt>Faith consent</dt>
            <dd>Each member gives it in their own app before joining.</dd>
          </div>
        ) : null}
      </dl>

      {open ? (
        <section className="card" aria-labelledby="leaders-h">
          <h2 id="leaders-h">Leaders</h2>
          <p className="muted">
            Choose a leader, and a co-leader if you like, from the people with a seat. They see the appointment in their Akana app and accept
            it there. A leader sees how many have joined, the schedule, check-in totals and the facilitator guide. They never see anyone&apos;s
            answers, names or contact details.
          </p>
          {seats.length === 0 ? (
            <p className="muted">Nobody has taken a seat yet.</p>
          ) : (
            (["leader", "co_leader"] as const).map((role) => (
              <form key={role} action={appointLeader} className="admin-form">
                {hidden("org", ctx.org.id)}
                {hidden("group", g.group_id)}
                {hidden("role", role)}
                <label htmlFor={`seat-${role}`}>{role === "leader" ? "Leader" : "Co-leader"}</label>
                <select id={`seat-${role}`} name="seat" required>
                  {seats.map((s) => (
                    <option key={s.seat_id} value={s.seat_id}>
                      {s.roster_email}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn secondary">
                  Appoint as {role === "leader" ? "leader" : "co-leader"}
                </button>
              </form>
            ))
          )}
          {(["leader", "co_leader"] as const)
            .filter((role) => (role === "leader" ? g.leader_state : g.co_leader_state) !== "none")
            .map((role) => (
              <form key={`un-${role}`} action={unappointLeader}>
                {hidden("org", ctx.org.id)}
                {hidden("group", g.group_id)}
                {hidden("role", role)}
                <button type="submit" className="btn secondary admin-row-btn">
                  Take back the {role === "leader" ? "leader" : "co-leader"} role
                </button>
              </form>
            ))}
        </section>
      ) : null}

      {open ? (
        <section className="card" aria-labelledby="schedule-h">
          <h2 id="schedule-h">Schedule</h2>
          <p className="muted">
            The date each unit starts for the group. Members see &quot;Your group is on week 3&quot;. Nothing is locked and nobody is shown as
            behind. Leaders can change this too.
          </p>
          <ScheduleEditor action={saveScheduleAsOwner} hidden={{ org: ctx.org.id, group: g.group_id }} units={units} schedule={schedule} startsOn={g.starts_on} />
        </section>
      ) : null}

      {g.status !== "archived" ? (
        <section className="card" aria-labelledby="details-h">
          <h2 id="details-h">Details</h2>
          <form action={updateGroup} className="admin-form">
            {hidden("org", ctx.org.id)}
            {hidden("group", g.group_id)}
            <label htmlFor="name">Group name</label>
            <input id="name" name="name" defaultValue={g.group_name} maxLength={60} required />
            <div className="check">
              <input id="confirm_name" name="confirm_name" type="checkbox" value="yes" />
              <label htmlFor="confirm_name">If we warn about the name, keep it anyway</label>
            </div>
            <label htmlFor="starts_on">Start date</label>
            <input id="starts_on" name="starts_on" type="date" defaultValue={g.starts_on ?? ""} />
            <label htmlFor="meeting_day">Meeting day</label>
            <select id="meeting_day" name="meeting_day" defaultValue={g.meeting_day ? String(g.meeting_day) : ""}>
              <option value="">No set day</option>
              {DAY_LABELS.map((d, i) => (
                <option key={d} value={String(i + 1)}>
                  {d}
                </option>
              ))}
            </select>
            <label htmlFor="meeting_time">Meeting time</label>
            <input id="meeting_time" name="meeting_time" type="time" defaultValue={g.meeting_time ? g.meeting_time.slice(0, 5) : ""} />
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={g.status}>
              <option value={g.status}>{labelOf(GROUP_STATUS_LABELS, g.status)} (no change)</option>
              {moves.map((m) => (
                <option key={m} value={m}>
                  {labelOf(GROUP_STATUS_LABELS, m)}
                </option>
              ))}
            </select>
            {moves.includes("archived") ? (
              <div className="check">
                <input id="confirm_archive" name="confirm_archive" type="checkbox" value="yes" />
                <label htmlFor="confirm_archive">I understand archiving closes the group for everyone</label>
              </div>
            ) : null}
            <button type="submit" className="btn">
              Save
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
