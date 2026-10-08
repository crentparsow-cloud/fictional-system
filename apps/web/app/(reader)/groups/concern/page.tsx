import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HelpNowButton } from "@/components/HelpNowButton";
import { GroupNoticeLine } from "@/components/org/GroupBits";
import { getReaderSession } from "@/lib/auth";
import { isUuidLike, type MyGroup } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";
import { reportConcern } from "../actions";

export const metadata: Metadata = { title: "Report a concern", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Report a concern about a group (F-216). Help now comes first. The report
 * goes to the Akana support inbox under the safeguarding topic, never to the
 * group's leader or the organisation. Akana is not a safeguarding service,
 * so a church group's members are pointed to their church's safeguarding
 * lead as well.
 */
export default async function ConcernPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const id = Array.isArray(sp.group) ? sp.group[0] : sp.group;
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/groups/concern?group=${id ?? ""}`)}`);
  if (!isUuidLike(id)) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase.rpc("my_org_groups");
  const g = ((data ?? []) as MyGroup[]).find((x) => x.group_id === id);
  if (!g) notFound();
  const church = g.organisation_kind === "church";

  return (
    <section className="tab-page groups-page">
      <div className="card help-first" role="region" aria-labelledby="help-first-h">
        <h1 id="help-first-h">If someone is in danger now</h1>
        <p>
          Call 999 in the UK, or your local emergency number. We are not a crisis service and we cannot check on anyone. Help now lists free
          support lines by country.
        </p>
        <HelpNowButton />
      </div>

      <h2>Report a concern about {g.group_name}</h2>
      <GroupNoticeLine code={sp.notice} />
      <p>
        Your report goes to the Akana team only. It does not go to the group, its leader or {g.organisation_name}. We read every report and
        reply to the email address on your account.
      </p>
      {church ? (
        <p className="card info-privacy">
          Akana is not a safeguarding service. If your concern is about someone&apos;s safety, please also speak to your church&apos;s
          safeguarding lead. Your church can tell you who that is.
        </p>
      ) : (
        <p className="muted">
          If your concern is about someone&apos;s safety at work, you can also speak to the person your organisation names for this, such as
          HR or a wellbeing lead.
        </p>
      )}

      <form action={reportConcern} className="admin-form">
        <input type="hidden" name="group" value={g.group_id} />
        <label htmlFor="message">What is the concern?</label>
        <textarea id="message" name="message" rows={6} maxLength={4000} required aria-describedby="message-help" />
        <p id="message-help" className="muted small">
          Please do not include anything you wrote in a workbook. You do not need to name anyone unless you want to.
        </p>
        <div className="check">
          <input id="consent" name="consent" type="checkbox" value="yes" required />
          <label htmlFor="consent">Akana may store this report and reply to me by email.</label>
        </div>
        <button type="submit" className="btn">
          Send to Akana
        </button>
      </form>
      <p className="small">
        <Link href="/groups">Back to your groups</Link>
      </p>
    </section>
  );
}
