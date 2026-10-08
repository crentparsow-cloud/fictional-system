import type { Metadata } from "next";
import Link from "next/link";
import { GuideUnitView, parseGuide } from "@/components/org/GroupBits";
import { requireGroupLeader } from "@/lib/org-groups-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Facilitator guide", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * The whole facilitator guide, laid out to print (F-212). Leaders of this
 * group only; the guide belongs to the version the group pinned.
 */
export default async function GuidePrintPage({ params }: { params: Params }) {
  const { id } = await params;
  const { view } = await requireGroupLeader(id, `/org/lead/${id}/guide`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_group_guide", { p_group: view.group_id });
  if (error) console.error("org_group_guide_failed", error.code ?? "");
  const guide = parseGuide(data);

  return (
    <div className="admin-page group-guide-print">
      <p className="group-print-hide">
        <Link href={`/org/lead/${view.group_id}`}>Back to the leader view</Link>
      </p>
      <h1>Facilitator guide: {view.workbook_title}</h1>
      <p className="muted">For leaders of {view.group_name}. Please do not share it outside the group&apos;s leaders.</p>
      {!guide ? (
        <p className="muted">There is no facilitator guide for this workbook yet.</p>
      ) : (
        <>
          {guide.intro ? <p>{guide.intro}</p> : null}
          {guide.safety.help_now_reminder ? (
            <p className="card info-privacy">
              At the start of each session, remind people that Help now in the Akana app lists free support lines, and that they can stop at
              any time.
            </p>
          ) : null}
          {guide.safety.safeguarding_note ? <p>{guide.safety.safeguarding_note}</p> : null}
          {guide.ground_rules && guide.ground_rules.length > 0 ? (
            <section aria-labelledby="rules-h">
              <h2 id="rules-h">Ground rules</h2>
              <ul>
                {guide.ground_rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {guide.units.map((u) => (
            <GuideUnitView key={u.unit_number} unit={u} />
          ))}
        </>
      )}
    </div>
  );
}
