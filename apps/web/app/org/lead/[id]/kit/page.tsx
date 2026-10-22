import type { Metadata } from "next";
import Link from "next/link";
import { SessionScheduler } from "@/components/org/SessionScheduler";
import { DISCUSSION_RULE, discussionGuide, talkOutline } from "@/lib/group-kit";
import { groupKitSource, requireGroupLeader } from "@/lib/org-groups-server";

export const metadata: Metadata = { title: "Leader kit", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * The group leader kit (9.2): a talk outline and a discussion guide for each
 * unit, welcome slides to print, and a session scheduler. It is made from the
 * workbook's own words. It cannot show anything a member wrote.
 */
export default async function LeaderKitPage({ params }: { params: Params }) {
  const { id } = await params;
  const { view } = await requireGroupLeader(id, `/org/lead/${id}/kit`);
  const kit = await groupKitSource(view.group_id);

  return (
    <div className="admin-page group-guide-print">
      <p className="group-print-hide">
        <Link href={`/org/lead/${view.group_id}`}>Back to the leader view</Link>
      </p>
      <h1>Leader kit: {view.workbook_title}</h1>
      <p className="muted">For leaders of {view.group_name}. It is made from the workbook. It never shows what anyone wrote.</p>
      {!kit ? (
        <p className="muted">The kit is not ready for this workbook yet.</p>
      ) : (
        <>
          <p className="group-print-hide">
            <Link className="btn secondary" href={`/org/lead/${view.group_id}/kit/slides`}>
              Welcome slides to print
            </Link>
          </p>
          <section className="card group-print-hide" aria-labelledby="sched-h">
            <h2 id="sched-h">Session dates</h2>
            <SessionScheduler units={kit.units.length} kitPath={`/org/lead/${view.group_id}/kit`} />
          </section>
          <p>{DISCUSSION_RULE}</p>
          {kit.units.map((u) => {
            const outline = talkOutline(u);
            const guide = discussionGuide(u);
            return (
              <section key={u.number} className="group-guide-unit" aria-labelledby={`kit-${u.number}`}>
                <h2 id={`kit-${u.number}`}>
                  Week {u.number}: {u.focus}
                </h2>
                <h3>Talk outline, about {outline.totalMinutes} minutes</h3>
                <ol>
                  {outline.blocks.map((b) => (
                    <li key={b.heading}>
                      <strong>
                        {b.heading} ({b.minutes} min)
                      </strong>
                      <ul>
                        {b.points.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
                <h3>Discussion questions</h3>
                <ol className="group-guide-questions">
                  {guide.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
