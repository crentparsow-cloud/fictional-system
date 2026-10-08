import Link from "next/link";
import { verifyHref } from "@/lib/mfa/role-mfa";
import { roleMfaMissing } from "@/lib/mfa/role-mfa-server";

/**
 * Shown in /console, /org and /studio to an owner, finance member or staff
 * whose session has not passed a second factor yet (F-143). Reading is
 * fine; changes to billing, seats, members, prices and licences ask first.
 */
export async function RoleMfaBanner({ next }: { next: string }) {
  if (!(await roleMfaMissing())) return null;
  return (
    <aside className="role-mfa-banner" aria-label="Account security">
      <p>Changes to billing, seats, members, prices and licences need a code from your authenticator app.</p>
      <Link className="btn secondary" href={verifyHref(next)}>
        Verify now
      </Link>
    </aside>
  );
}
