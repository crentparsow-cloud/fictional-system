import Link from "next/link";
import { studioNotice, withOrg } from "@/lib/studio";
import type { StudioContext } from "@/lib/studio-server";

/** One line of feedback after an action. Fixed codes only, never free text. */
export function StudioNotice({ code }: { code: string | string[] | undefined }) {
  const m = studioNotice(code);
  if (!m) return null;
  return (
    <p className={`admin-notice admin-notice-${m.tone}`} role={m.tone === "error" ? "alert" : "status"}>
      {m.text}
    </p>
  );
}

/** The draft licence banner, shown wherever the licence comes up. */
export function LicenceDraftBanner() {
  return (
    <p className="studio-draft" role="note">
      <strong>Draft licence.</strong> The licence text is waiting for the lawyer. No real author or publisher can sign it until the approved version
      is in place. You can read it now and get everything else ready.
    </p>
  );
}

/** Switch between organisations when the person belongs to more than one. */
export function OrgSwitcher({ ctx, path }: { ctx: StudioContext; path: string }) {
  if (!ctx.multi) return <p className="muted studio-org">{ctx.org.displayName}</p>;
  return (
    <nav className="studio-org" aria-label="Your organisations">
      <span className="muted">Working in:</span>
      <ul>
        {ctx.orgs.map((o) => (
          <li key={o.id}>
            <Link href={withOrg(path, o.id, true)} aria-current={o.id === ctx.org.id ? "page" : undefined} className={o.id === ctx.org.id ? "is-active" : undefined}>
              {o.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
