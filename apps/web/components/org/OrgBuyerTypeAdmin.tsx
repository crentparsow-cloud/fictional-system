import { setBuyerType } from "@/app/admin/(gated)/business/billing-actions";

/**
 * Staff view of whether a customer buys as a consumer or a business (0031).
 * A self-serve Group organiser is a consumer: the DMCC Act subscription
 * rules apply (reminder notices, the 14-day cooling-off, cancelling on the
 * Billing page). Teams, churches and invoiced customers are businesses.
 */
export function OrgBuyerTypeAdmin(props: { orgId: string; buyerType: string | null; write: boolean }) {
  const type = props.buyerType === "consumer" ? "consumer" : "business";
  return (
    <div className="org-buyer-type">
      <p className="small">
        <b>Buys as:</b>{" "}
        {type === "consumer"
          ? "a consumer (personal plan). Reminder notices, a 14-day cooling-off and cancelling on Billing apply."
          : "a business. The consumer subscription rules do not apply."}
      </p>
      {props.write ? (
        <details>
          <summary>Change buyer type</summary>
          <form className="admin-form" action={setBuyerType}>
            <input type="hidden" name="org" value={props.orgId} />
            <label htmlFor={`buyer-${props.orgId}`}>Buys as</label>
            <select id={`buyer-${props.orgId}`} name="buyer_type" defaultValue={type} required>
              <option value="consumer">A consumer (an individual paying personally)</option>
              <option value="business">A business, church or charity</option>
            </select>
            <label htmlFor={`buyer-reason-${props.orgId}`}>Reason (kept in the audit log)</label>
            <input id={`buyer-reason-${props.orgId}`} name="reason" maxLength={500} required />
            <button type="submit" className="btn secondary">
              Save
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
