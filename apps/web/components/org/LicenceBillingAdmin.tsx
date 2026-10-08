import { overrideBand, startBilling } from "@/app/admin/(gated)/business/billing-actions";
import { billingNotice, billingStateText, CHURCH_BAND_PLANS, isBandPlan, ORG_PLANS, isOrgPlanId, orgPriceId, plansForLicenceKind, TALK_TO_US } from "@/lib/org-billing";
import { formatOrgDate } from "@/lib/org-pilot";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Staff view of one licence's Stripe billing on /admin/business/<id>
 * (F-220): its mirror, or a form to start billing it in Stripe TEST MODE on
 * 30-day invoice terms. A plan with no price id is "Talk to us" and cannot
 * be chosen. Pilots are free and never billed.
 */
export async function LicenceBillingAdmin(props: {
  orgId: string;
  licenceId: string;
  kind: string;
  status: string;
  write: boolean;
  notice?: string | string[];
}) {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("org_subscriptions")
    .select("status, plan, quantity, paid_quantity, collection_method, current_period_end, cancel_at_period_end, livemode")
    .eq("licence_id", props.licenceId)
    .maybeSingle();
  const { data: lic } = await supabase.from("org_licences").select("billing_state, grace_until, end_requested_at, ends_at").eq("id", props.licenceId).maybeSingle();
  const sub = data as {
    status: string;
    plan: string | null;
    quantity: number;
    paid_quantity: number;
    collection_method: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    livemode: boolean;
  } | null;
  const notice = billingNotice(props.notice);

  if (props.kind === "pilot") return <p className="muted small">Pilot: free, never billed, puts nothing in the pool.</p>;

  if (sub) {
    return (
      <div className="org-billing-admin">
        <p className="small">
          <b>Stripe{sub.livemode ? "" : " (test mode)"}:</b> {sub.plan && isOrgPlanId(sub.plan) ? ORG_PLANS[sub.plan].label : "plan not known"}, {sub.quantity}{" "}
          billed, {sub.paid_quantity} paid this period, {sub.collection_method === "send_invoice" ? "invoice" : "card"}.{" "}
          {billingStateText(
            {
              licenceStatus: props.status,
              billingState: (lic?.billing_state as string | null) ?? sub.status,
              graceUntil: (lic?.grace_until as string | null) ?? null,
              endRequested: Boolean(lic?.end_requested_at),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              periodEnd: sub.current_period_end,
              endsAt: (lic?.ends_at as string | undefined) ?? "",
            },
            (iso) => formatOrgDate(iso),
          )}
        </p>
        {props.write && isBandPlan(sub.plan) && props.status !== "ended" && !["canceled", "incomplete_expired"].includes(sub.status) ? (
          <details>
            <summary>Change band (staff override)</summary>
            {notice ? (
              <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
                {notice.text}
              </p>
            ) : null}
            <form className="admin-form" action={overrideBand}>
              <input type="hidden" name="org" value={props.orgId} />
              <input type="hidden" name="licence" value={props.licenceId} />
              <label htmlFor={`oband-${props.licenceId}`}>Band</label>
              <select id={`oband-${props.licenceId}`} name="plan" defaultValue={sub.plan ?? undefined} required>
                {CHURCH_BAND_PLANS.map((b) => (
                  <option key={b} value={b} disabled={orgPriceId(b) === null}>
                    {ORG_PLANS[b].label}
                    {orgPriceId(b) === null ? " (no price id)" : ""}
                  </option>
                ))}
              </select>
              <div className="check">
                <input id={`oprorate-${props.licenceId}`} name="prorate" type="checkbox" value="yes" defaultChecked />
                <label htmlFor={`oprorate-${props.licenceId}`}>Prorate in Stripe</label>
              </div>
              <label htmlFor={`oreason-${props.licenceId}`}>Reason (kept in the audit log)</label>
              <input id={`oreason-${props.licenceId}`} name="reason" maxLength={500} required />
              <p className="muted small">Works while past due or ending, and below the band&apos;s size. Seats never drop below the places taken.</p>
              <button type="submit" className="btn secondary">
                Change band
              </button>
            </form>
          </details>
        ) : null}
      </div>
    );
  }

  if (!props.write || props.status === "ended") return <p className="muted small">Billed by hand. Not in Stripe.</p>;
  const plans = plansForLicenceKind(props.kind);
  return (
    <details className="org-billing-admin">
      <summary>Bill this licence in Stripe (test mode)</summary>
      {notice ? (
        <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      {plans.every((p) => !p.priced) ? (
        <p className="muted">No price is set for this kind of licence yet. {TALK_TO_US}.</p>
      ) : (
        <form className="admin-form" action={startBilling}>
          <input type="hidden" name="org" value={props.orgId} />
          <input type="hidden" name="licence" value={props.licenceId} />
          <fieldset>
            <legend>Plan</legend>
            {plans.map(({ plan, priced }) => (
              <div className="check" key={plan.id}>
                <input id={`plan-${props.licenceId}-${plan.id}`} name="plan" type="radio" value={plan.id} disabled={!priced} required />
                <label htmlFor={`plan-${props.licenceId}-${plan.id}`}>
                  {plan.label}
                  {priced ? "" : `: ${TALK_TO_US.toLowerCase()} (no price id)`}
                </label>
              </div>
            ))}
          </fieldset>
          <label htmlFor={`po-${props.licenceId}`}>PO number for the invoice (optional)</label>
          <input id={`po-${props.licenceId}`} name="po_number" maxLength={60} autoComplete="off" />
          <div className="check">
            <input id={`bill-${props.licenceId}`} name="confirm" type="checkbox" value="yes" required />
            <label htmlFor={`bill-${props.licenceId}`}>
              Create the Stripe customer and subscription. The first invoice goes to the billing contact with 30 days to pay.
            </label>
          </div>
          <button type="submit" className="btn secondary">
            Start billing
          </button>
        </form>
      )}
    </details>
  );
}
