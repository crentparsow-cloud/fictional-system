import type { Metadata } from "next";
import Link from "next/link";
import { GroupNoticeLine } from "@/components/org/GroupBits";
import { formatOrgDate, isPastIso, labelOf, LICENCE_KIND_LABELS } from "@/lib/org-pilot";
import { requireOrgConsole, withOrgParam } from "@/lib/org-pilot-server";
import { DAY_LABELS, GROUP_STATUS_LABELS, groupCountText, LEADER_STATE_LABELS, meetingText, weekShort } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";
import { createGroup } from "./actions";

export const metadata: Metadata = { title: "Groups", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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

interface Licence {
  id: string;
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

interface Title {
  workbook_id: string;
  title: string;
  faith: boolean;
}

/**
 * Groups (F-210). One title per group, pinned to the version current when
 * the group was made. The owner creates groups and appoints leaders from
 * the people holding seats; members join from their own app. The list shows
 * how many have joined only when that number is at least the threshold.
 */
export default async function OrgGroupsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireOrgConsole("/org/groups", sp.org);
  const canManage = ctx.org.role === "owner";
  const canRead = ["owner", "finance", "viewer"].includes(ctx.org.role);
  const supabase = await createUserClient();

  const groups = canRead ? await supabase.rpc("org_group_list", { p_org: ctx.org.id }) : { data: [], error: null };
  if (groups.error) console.error("org_group_list_failed", groups.error.code ?? "");
  const rows = (groups.data ?? []) as GroupRow[];

  const licences = canManage
    ? (((await supabase.from("org_licences").select("id, kind, status, starts_at, ends_at").eq("org_id", ctx.org.id).eq("status", "active")).data ??
        []) as Licence[]).filter((l) => !isPastIso(l.ends_at))
    : [];
  const titles = new Map<string, Title[]>();
  await Promise.all(
    licences.map(async (l) => {
      const r = await supabase.rpc("org_licence_group_titles", { p_licence: l.id });
      titles.set(l.id, (r.data ?? []) as Title[]);
    }),
  );
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const isChurch = ctx.org.kind === "church";

  return (
    <div className="admin-page studio-page org-console">
      <p className="muted studio-org">{ctx.org.displayName}</p>
      <h1>Groups</h1>
      <GroupNoticeLine code={sp.notice} />

      <section className="card info-privacy" aria-labelledby="groups-privacy-h">
        <h2 id="groups-privacy-h">How groups keep people&apos;s privacy</h2>
        <p>
          A group follows one workbook together. Members join from their own Akana app; nobody is added without choosing to. You see how
          many have joined once there are at least 5. Leaders see how many people chose each check-in answer, never who, and never what
          anyone wrote. Members cannot message each other and cannot see each other&apos;s details.
        </p>
        {isChurch ? (
          <p className="muted">
            Because your organisation is a church, each member is asked for explicit consent before joining, as group membership can show
            religious belief. Concerns raised in the app go to the Akana team. Please make sure members know who your safeguarding lead is.
          </p>
        ) : null}
      </section>

      {!canRead ? (
        <p className="admin-note">Your role in {ctx.org.displayName} does not include groups. Ask the owner if you need to see them.</p>
      ) : rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>No groups yet</h2>
          <p className="muted">{canManage ? "Create one below." : "The owner can create groups."}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption>Your groups</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Workbook</th>
                <th scope="col">Status</th>
                <th scope="col">Where it is</th>
                <th scope="col">Members</th>
                <th scope="col">Leader</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.group_id}>
                  <td>
                    {canManage ? <Link href={withOrgParam(`/org/groups/${g.group_id}`, ctx.org.id, ctx.multi)}>{g.group_name}</Link> : g.group_name}
                    {meetingText(g.meeting_day, g.meeting_time) ? <span className="muted small"> {meetingText(g.meeting_day, g.meeting_time)}</span> : null}
                  </td>
                  <td>{g.workbook_title}</td>
                  <td>
                    <span className={`badge admin-status admin-status-${g.status}`}>{labelOf(GROUP_STATUS_LABELS, g.status)}</span>
                  </td>
                  <td>{g.scheduled_units === 0 ? <span className="muted">No schedule yet</span> : weekShort(g.current_week, g.current_unit)}</td>
                  <td>{groupCountText(g.members_shown, g.members, g.threshold)}</td>
                  <td>{labelOf(LEADER_STATE_LABELS, g.leader_state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage
        ? licences.map((l) => {
            const t = titles.get(l.id) ?? [];
            return (
              <section key={l.id} className="card" aria-labelledby={`new-${l.id}`}>
                <h2 id={`new-${l.id}`}>
                  New group on your {labelOf(LICENCE_KIND_LABELS, l.kind).toLowerCase()} licence
                </h2>
                <p className="muted small">
                  Licence {formatOrgDate(l.starts_at)} to {formatOrgDate(l.ends_at)}.
                </p>
                {t.length === 0 ? (
                  <p className="muted">No titles on this licence can be used for a group yet.</p>
                ) : (
                  <form action={createGroup} className="admin-form">
                    {hidden("org", ctx.org.id)}
                    {hidden("licence", l.id)}
                    <label htmlFor={`name-${l.id}`}>Group name</label>
                    <input id={`name-${l.id}`} name="name" maxLength={60} required autoComplete="off" aria-describedby={`name-help-${l.id}`} />
                    <p id={`name-help-${l.id}`} className="muted small">
                      Everyone in the group sees this name. Keep it neutral, such as the day or place you meet. Avoid words that say why people
                      are there.
                    </p>
                    <div className="check">
                      <input id={`confirm-${l.id}`} name="confirm_name" type="checkbox" value="yes" />
                      <label htmlFor={`confirm-${l.id}`}>If we warn about the name, keep it anyway</label>
                    </div>
                    <label htmlFor={`wb-${l.id}`}>Workbook</label>
                    <select id={`wb-${l.id}`} name="workbook" required>
                      {t.map((x) => (
                        <option key={x.workbook_id} value={x.workbook_id}>
                          {x.title}
                          {x.faith ? " (faith title: members are asked for consent)" : ""}
                        </option>
                      ))}
                    </select>
                    <label htmlFor={`start-${l.id}`}>Start date (optional)</label>
                    <input id={`start-${l.id}`} name="starts_on" type="date" />
                    <label htmlFor={`day-${l.id}`}>Meeting day (optional)</label>
                    <select id={`day-${l.id}`} name="meeting_day" defaultValue="">
                      <option value="">No set day</option>
                      {DAY_LABELS.map((d, i) => (
                        <option key={d} value={String(i + 1)}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <label htmlFor={`time-${l.id}`}>Meeting time (optional)</label>
                    <input id={`time-${l.id}`} name="meeting_time" type="time" />
                    <button type="submit" className="btn">
                      Create group
                    </button>
                  </form>
                )}
              </section>
            );
          })
        : null}
    </div>
  );
}
