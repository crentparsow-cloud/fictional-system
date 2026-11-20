import { setTenantSignIn } from "../sign-in-actions";
import { createUserClient } from "@/lib/supabase/server";
import { tenantSignInConfigured } from "@/lib/tenant-resolve";
import { tenantSessionSealer } from "@/lib/tenant-session-store";

/**
 * Reader sign-in on this tenant's own host (F-133, migration 0073). Shows
 * whether it is on, and lets a platform owner switch it. Switching on asks
 * the owner to confirm the step that must come first (the access token
 * hook); switching off also signs out every reader signed in on the
 * tenant's host. No redirect URL is added for a tenant host: sign-in there
 * is by a typed code, never a link.
 * docs/TENANT_SIGN_IN.md has the go-live steps.
 */
export async function SignInSection({ tenantId, canEdit }: { tenantId: string; canEdit: boolean }) {
  const supabase = await createUserClient();
  const { data } = await supabase.rpc("tenant_sign_in_enabled", { p_tenant: tenantId });
  const on = data === true;
  const deployed = tenantSignInConfigured();
  const keyed = tenantSessionSealer() !== null;

  return (
    <section id="sign-in" aria-labelledby="sign-in-h">
      <h2 id="sign-in-h">Reader sign-in on this site</h2>
      <p>
        Readers sign in on the tenant&apos;s own host with their Akana account, by a code Akana emails them for that site only. A session made there works on this
        tenant&apos;s site only. It cannot be used on the Akana site or on another tenant&apos;s.
      </p>
      <p>
        <span className="badge">{on ? "On" : "Off"}</span> {on ? "Readers can sign in and read what is free on this site." : "Sign-in is a 404 on this site. It serves its catalogue only."}
      </p>
      {!deployed ? (
        <p className="muted small">The deployment switch TENANT_SIGN_IN is not set, so sign-in stays off on every tenant host whatever is chosen here.</p>
      ) : null}
      {!keyed ? (
        <p className="muted small">TENANT_SESSION_KEYS is not set or not valid, so nobody can sign in on a tenant host whatever is chosen here.</p>
      ) : null}
      <form action={setTenantSignIn} className="admin-form">
        <input type="hidden" name="tenant_id" value={tenantId} />
        {on ? null : (
          <>
            <input type="hidden" name="enabled" value="on" />
            <div className="check">
              <input id="si-hook" name="hook" type="checkbox" value="yes" disabled={!canEdit} />
              <label htmlFor="si-hook">The access token hook is enabled in Supabase (Authentication, Hooks).</label>
            </div>
          </>
        )}
        <label htmlFor="si-reason">Why (kept in the audit log)</label>
        <input id="si-reason" name="reason" type="text" maxLength={500} required disabled={!canEdit} />
        <button type="submit" className={on ? "btn secondary" : "btn"} disabled={!canEdit}>
          {on ? "Switch sign-in off and sign readers out" : "Switch sign-in on"}
        </button>
        {!canEdit ? <p className="muted small">Only a platform owner can change this.</p> : null}
      </form>
    </section>
  );
}
