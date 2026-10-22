import type { Metadata } from "next";
import Link from "next/link";
import { getReaderSession } from "@/lib/auth";
import { CANCEL_COPY, cancelConsequence, cancelView, pickSubject } from "@/lib/cancel-flow";
import { inCoolingOff } from "@/lib/membership-refund";
import { PAUSE_MONTHS, pauseDateWords, pauseOptionLine } from "@/lib/membership-pause";
import { loadSubjects, type FlowSubject } from "@/lib/membership-cancel-server";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { CancelForm } from "./CancelForm";

export const metadata: Metadata = { title: "Cancel membership", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Cancel membership (14.24). Two taps from You: the link on You, then the
 * Cancel button here. One screen, one optional reason, one offer (a pause), and a Cancel button that says
 * what it does. A confirmation email follows at once. Cancelling here is
 * the same as writing to support. It ends the plan at the end of the period
 * you have paid for, through the Stripe API, and never sends the reader to
 * Stripe's billing portal, which is kept for card updates only.
 */
export default async function CancelMembershipPage() {
  const session = await getReaderSession();
  if (!session) {
    return (
      <section className="tab-page you-page">
        <h1>{CANCEL_COPY.title}</h1>
        <p>
          <Link href="/sign-in?next=/you/membership/cancel">Sign in</Link> to manage your membership.
        </p>
      </section>
    );
  }
  const tenantId = await tenantIdForRequest();
  const supabase = await createUserClient();
  const now = new Date();
  const subjects = tenantId ? await loadSubjects(supabase, session.userId, tenantId).catch(() => null) : null;
  const subject = subjects ? pickSubject(subjects) : null;
  const view = cancelView(subject, now);
  const longDate = (iso: string) => pauseDateWords(iso);

  // A person with a place on someone else's membership pays nothing: they leave from You.
  const { data: seat } = await supabase.from("membership_seats").select("id").eq("member_user_id", session.userId).eq("status", "active").limit(1);
  const holdsSeat = ((seat as { id: string }[] | null) ?? []).length > 0;

  return (
    <section className="tab-page you-page cancel-page">
      <p className="eyebrow">
        <Link href="/you#membership">You</Link>
      </p>
      <h1>{CANCEL_COPY.title}</h1>

      {subjects === null ? (
        <p>Your membership could not be read just now. Please try again in a few minutes, or write to support.</p>
      ) : view.kind === "none" ? (
        <>
          <p>{holdsSeat ? "You have a place on a shared membership. You pay nothing, so there is nothing to cancel." : "You do not have a membership to cancel."}</p>
          {holdsSeat ? <p>To leave the shared membership, go to You, then Membership, then Leave the shared membership.</p> : null}
          <p>
            <Link className="btn secondary" href="/you#membership">
              Back to You
            </Link>
          </p>
        </>
      ) : view.kind === "ending" ? (
        <>
          <p>{view.endsOn ? `Your membership is already set to end on ${longDate(view.endsOn)}. It will not renew.` : "Your membership is already set to end. It will not renew."}</p>
          <p>If you change your mind before then, write to support.</p>
          <p>
            <Link className="btn secondary" href="/you#membership">
              Back to You
            </Link>
          </p>
        </>
      ) : (
        <CancelBody subject={subject!} view={view} now={now} longDate={longDate} />
      )}
    </section>
  );
}

async function CancelBody({
  subject,
  view,
  now,
  longDate,
}: {
  subject: FlowSubject;
  view: Extract<ReturnType<typeof cancelView>, { kind: "cancellable" }>;
  now: Date;
  longDate: (iso: string) => string;
}) {
  const periodEnd = subject.currentPeriodEnd ? new Date(subject.currentPeriodEnd) : null;
  const pauseLines = periodEnd
    ? PAUSE_MONTHS.map((m) => ({ months: m, button: m === 1 ? "Pause for 1 month" : `Pause for ${m} months`, line: pauseOptionLine(periodEnd, m).replace(/^\d+ months?: /, "") }))
    : [];
  const cooling = !view.trialing && inCoolingOff(new Date(subject.createdAt), now);
  return (
    <>
      <p>{CANCEL_COPY.lead}</p>
      <CancelForm
        view={view}
        pauseLines={view.pausable ? pauseLines : []}
        consequence={cancelConsequence(view, cooling, longDate)}
      />
    </>
  );
}
