import type { Metadata } from "next";
import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { GroupNoticeLine, GuideUnitView, parseGuide, ScheduleEditor } from "@/components/org/GroupBits";
import { formatOrgDate, labelOf } from "@/lib/org-pilot";
import { CHECKIN_LABELS, GROUP_STATUS_LABELS, groupCountText, groupWeekLine, londonToday, meetingText } from "@/lib/org-groups";
import { groupCheckinCounts, groupSchedule, groupUnits, requireGroupLeader } from "@/lib/org-groups-server";
import { createUserClient } from "@/lib/supabase/server";
import { saveScheduleAsLeader } from "../../groups/actions";

export const metadata: Metadata = { title: "Leader view", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * The leader view (F-210 to F-213). The group's week, the schedule, how
 * many chose each check-in answer for a unit (never who, and nothing when
 * fewer than 5 counted), and the facilitator guide for that unit. No member
 * names, no contact details, no answers. Help now first.
 */
export default async function LeaderViewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const { view } = await requireGroupLeader(id, `/org/lead/${id}`);
  const [units, schedule] = await Promise.all([groupUnits(view.group_id), groupSchedule(view.group_id)]);

  const wanted = Number(Array.isArray(sp.unit) ? sp.unit[0] : sp.unit);
  const opened = schedule.filter((s) => s.opens_on <= londonToday()).map((s) => s.unit_number);
  const unit = Number.isInteger(wanted) && opened.includes(wanted) ? wanted : (view.current_unit ?? null);
  const counts = unit ? await groupCheckinCounts(view.group_id, unit) : [];
  const threshold = counts[0]?.threshold ?? 5;
  const allHidden = counts.length === 0 || counts.every((c) => c.shown === "hidden");

  let guideUnit = null;
  if (view.guide_available && unit) {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("org_group_guide", { p_group: view.group_id });
    if (error) console.error("org_group_guide_failed", error.code ?? "");
    guideUnit = parseGuide(data)?.units.find((u) => u.unit_number === unit) ?? null;
  }
  const open = view.status === "draft" || view.status === "running";
  const meets = meetingText(view.meeting_day, view.meeting_time);

  return (
    <div className="admin-page studio-page org-console">
      <div className="page-head">
        <p className="muted studio-org">
          {view.organisation_name}. You are the {view.my_role === "co_leader" ? "co-leader" : "leader"}.
        </p>
        <HelpNowButton />
      </div>
      <h1>{view.group_name}</h1>
      <GroupNoticeLine code={sp.notice} />
      <dl className="admin-dl">
        <div>
          <dt>Workbook</dt>
          <dd>{view.workbook_title}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{labelOf(GROUP_STATUS_LABELS, view.status)}</dd>
        </div>
        <div>
          <dt>This week</dt>
          <dd>{groupWeekLine(view.current_week, view.current_unit)}</dd>
        </div>
        {meets ? (
          <div>
            <dt>Meets</dt>
            <dd>{meets}</dd>
          </div>
        ) : null}
        <div>
          <dt>Joined</dt>
          <dd>{view.members}</dd>
        </div>
      </dl>

      <section className="card info-privacy" aria-labelledby="lead-privacy-h">
        <h2 id="lead-privacy-h">What you can and cannot see</h2>
        <p>
          You see how many have joined and how many chose each check-in answer. You never see who chose what, anyone&apos;s answers, or
          anyone&apos;s contact details. Please do not ask people to read out or show what they wrote. Taking part, and checking in, is always
          each person&apos;s choice.
        </p>
        {view.organisation_kind === "church" ? (
          <p className="muted">
            If someone tells you something that worries you about their safety or someone else&apos;s, follow your church&apos;s safeguarding
            policy and speak to your safeguarding lead. Akana is not a safeguarding service.
          </p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="checkins-h">
        <h2 id="checkins-h">Check-ins{unit ? `, unit ${unit}` : ""}</h2>
        {opened.length > 1 ? (
          <nav aria-label="Choose a unit" className="group-unit-nav">
            {opened.map((u) => (
              <Link key={u} href={`/org/lead/${view.group_id}?unit=${u}`} aria-current={u === unit ? "page" : undefined}>
                Unit {u}
              </Link>
            ))}
          </nav>
        ) : null}
        {!unit ? (
          <p className="muted">Check-ins open when the first unit on the schedule starts.</p>
        ) : allHidden ? (
          <p className="muted">Fewer than {threshold} people have checked in for this unit and chosen to count, so nothing is shown yet.</p>
        ) : (
          <dl className="admin-dl">
            {counts.map((c) => (
              <div key={c.choice}>
                <dt>{labelOf(CHECKIN_LABELS, c.choice)}</dt>
                <dd>{groupCountText(c.shown, c.n, c.threshold)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="muted small">
          Only check-ins people chose to count are included, up to the end of yesterday. A number under {threshold} is not shown, so no one can
          be picked out.
        </p>
      </section>

      <section className="card" aria-labelledby="guide-h">
        <h2 id="guide-h">Facilitator guide</h2>
        {!view.guide_available ? (
          <p className="muted">There is no facilitator guide for this workbook yet.</p>
        ) : guideUnit ? (
          <>
            <GuideUnitView unit={guideUnit} />
            <p>
              <Link href={`/org/lead/${view.group_id}/guide`}>Print the whole guide</Link>
            </p>
          </>
        ) : (
          <p>
            <Link href={`/org/lead/${view.group_id}/guide`}>Read the whole guide</Link>
          </p>
        )}
      </section>

      {open ? (
        <section className="card" aria-labelledby="schedule-h">
          <h2 id="schedule-h">Schedule</h2>
          {view.starts_on ? <p className="muted">Starts {formatOrgDate(view.starts_on)}.</p> : null}
          <ScheduleEditor action={saveScheduleAsLeader} hidden={{ group: view.group_id }} units={units} schedule={schedule} startsOn={view.starts_on} />
        </section>
      ) : null}

      <section className="card" aria-labelledby="concern-h">
        <h2 id="concern-h">Worried about something in the group?</h2>
        <p>
          You can <Link href={`/groups/concern?group=${view.group_id}`}>report a concern to the Akana team</Link>. It does not go to your
          organisation.
        </p>
      </section>
    </div>
  );
}
