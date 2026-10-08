import { addTenantDomain, removeTenantDomain, verifyTenantDomain } from "../domain-actions";
import {
  CHECK_RESULT_LABEL,
  cnameTarget,
  DOMAIN_STATE_LABEL,
  domainState,
  MAX_DOMAINS_PER_TENANT,
  txtRecordName,
  txtRecordValue,
  VERCEL_APEX_A,
  type DomainRow,
} from "@/lib/tenant-domains";
import { createUserClient } from "@/lib/supabase/server";

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
}

/**
 * Custom domains for one white-label tenant (migration 0033). Shows the DNS
 * records the tenant must add, the Vercel dashboard step for Crent, and the
 * state of each host. Reads through the user client: tenant_domains_read
 * (0001) lets staff see every row.
 */
export async function DomainsSection({ tenantId, disabled }: { tenantId: string; disabled: boolean }) {
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("tenant_domains")
    .select("host, verification_token, verified_at, last_checked_at, last_check_result, consecutive_failures, stopped_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at")
    .limit(MAX_DOMAINS_PER_TENANT + 5);
  const rows = (data ?? []) as DomainRow[];
  const target = cnameTarget();
  const full = rows.length >= MAX_DOMAINS_PER_TENANT;

  return (
    <section id="domains" aria-labelledby="domains-h">
      <h2 id="domains-h">Custom domains</h2>
      <p>
        A tenant can serve its site on its own host, such as books.example.com. Add the host here, then the tenant adds two DNS records and
        Crent adds the host in Vercel. The host is served once the TXT record checks out. Akana checks every host once a day. A verified host
        that fails 3 checks in a row stops being served until it passes again.
      </p>
      <p className="muted small">
        Checks use Cloudflare&apos;s public DNS-over-HTTPS resolver. Only the record name is sent. A lookup that gets no answer is not counted
        as a failure.
      </p>

      {rows.length === 0 ? <p className="muted">No custom domains yet.</p> : null}
      {rows.map((d) => {
        const state = domainState(d);
        return (
          <article key={d.host} className="admin-domain" aria-labelledby={`dom-${d.host}`}>
            <h3 id={`dom-${d.host}`}>{d.host}</h3>
            <p>
              <span className={`badge admin-domain-${state}`}>{state === "live" || state === "live_failing" ? "Verified" : state === "stopped" ? "Stopped" : "Pending"}</span>{" "}
              {DOMAIN_STATE_LABEL[state]}
            </p>
            <p className="muted small">
              Last checked {when(d.last_checked_at)}
              {d.last_check_result ? `. ${CHECK_RESULT_LABEL[d.last_check_result]}` : ""}
              {d.consecutive_failures > 0 ? ` Failed checks in a row: ${d.consecutive_failures}.` : ""}
              {d.verified_at ? ` Verified ${when(d.verified_at)}.` : ""}
            </p>

            <h4>1. The tenant adds these DNS records</h4>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Name</th>
                    <th scope="col">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>TXT</td>
                    <td>
                      <code>{txtRecordName(d.host)}</code>
                    </td>
                    <td>
                      <code>{txtRecordValue(d.verification_token)}</code>
                    </td>
                  </tr>
                  <tr>
                    <td>CNAME</td>
                    <td>
                      <code>{d.host}</code>
                    </td>
                    <td>
                      <code>{target}</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="muted small">
              If the host is the root of a domain (example.com rather than books.example.com), most DNS providers do not allow a CNAME there. Use an
              A record to <code>{VERCEL_APEX_A}</code> instead, or whatever Vercel shows for the domain. Keep the TXT record in place after
              verification: the daily check needs it.
            </p>

            <h4>2. Crent adds the host in Vercel</h4>
            <ol className="small">
              <li>Open the Akana project in the Vercel dashboard, then Settings, then Domains.</li>
              <li>
                Choose Add Domain, enter <code>{d.host}</code> and pick Production. Do not redirect it to another domain.
              </li>
              <li>If Vercel asks for its own TXT record to prove ownership, pass that to the tenant too.</li>
              <li>Wait until Vercel shows Valid Configuration and has issued the certificate.</li>
            </ol>

            <h4>3. Verify</h4>
            <form action={verifyTenantDomain} className="admin-form admin-inline-form">
              <input type="hidden" name="tenant_id" value={tenantId} />
              <input type="hidden" name="host" value={d.host} />
              <button type="submit" className="btn" disabled={disabled}>
                Check the TXT record now
              </button>
            </form>

            <details>
              <summary>Remove this host</summary>
              <form action={removeTenantDomain} className="admin-form">
                <input type="hidden" name="tenant_id" value={tenantId} />
                <input type="hidden" name="host" value={d.host} />
                <label htmlFor={`rm-${d.host}`}>Reason</label>
                <input id={`rm-${d.host}`} name="reason" required maxLength={500} disabled={disabled} />
                <p className="muted small">The host stops being served within a minute. Remove it from Vercel as well.</p>
                <button type="submit" className="btn secondary" disabled={disabled}>
                  Remove host
                </button>
              </form>
            </details>
          </article>
        );
      })}

      <h3>Add a host</h3>
      {full ? <p className="muted">This tenant has {MAX_DOMAINS_PER_TENANT} hosts, the most allowed. Remove one to add another.</p> : null}
      <form action={addTenantDomain} className="admin-form">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <label htmlFor="dom-add">Host name</label>
        <input
          id="dom-add"
          name="host"
          required
          maxLength={253}
          placeholder="books.example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled || full}
        />
        <button type="submit" className="btn" disabled={disabled || full}>
          Add host
        </button>
      </form>
    </section>
  );
}
