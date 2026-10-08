import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createMailer } from "@akana/emails";
import { getReaderSession } from "@/lib/auth";
import { hashToken, mintToken } from "@/lib/partner";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { createUserClient } from "@/lib/supabase/server";
import { adminJoinUrl, formatOrgDate, isCustomerKind, orgErrorNotice, seatJoinUrl, type OrgNotice } from "@/lib/org-pilot";

/**
 * Server side of Akana for organisations (F-202 to F-204). Everything runs
 * through the signed-in person's client, so row level security and the 0024
 * functions decide what comes back. No service role here. The plain token
 * for an invitation goes only into the email; the database gets its hash.
 */

export interface CustomerOrg {
  id: string;
  displayName: string;
  kind: string;
  role: string;
  status: string;
}

export interface OrgConsoleContext {
  userId: string;
  orgs: CustomerOrg[];
  org: CustomerOrg;
  multi: boolean;
}

type MemberRow = { role: string; organisations: { id: string; display_name: string; kind: string; status: string } | null };

export const getCustomerMemberships = cache(async function getCustomerMemberships(userId: string): Promise<CustomerOrg[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("role, organisations(id, display_name, kind, status)")
    .eq("user_id", userId);
  if (error) console.error("org_console_memberships_failed", error.code ?? "");
  return ((data ?? []) as unknown as MemberRow[])
    .filter((r) => r.organisations && isCustomerKind(r.organisations.kind))
    .map((r) => ({ id: r.organisations!.id, displayName: r.organisations!.display_name, kind: r.organisations!.kind, role: r.role, status: r.organisations!.status }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * For the console: the signed-in person and the customer organisation they
 * are looking at. Signed out goes to sign-in. Someone with no customer
 * organisation sees a 404: the console is for people Akana staff set up.
 */
export async function requireOrgConsole(next: string, orgParam?: string | string[]): Promise<OrgConsoleContext> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const orgs = await getCustomerMemberships(session.userId);
  if (orgs.length === 0) notFound();
  const wanted = Array.isArray(orgParam) ? orgParam[0] : orgParam;
  const org = (wanted && UUID.test(wanted) && orgs.find((o) => o.id === wanted)) || orgs[0]!;
  return { userId: session.userId, orgs, org, multi: orgs.length > 1 };
}

export function withOrgParam(path: string, orgId: string, multi: boolean): string {
  if (!multi) return path;
  return `${path}${path.includes("?") ? "&" : "?"}org=${orgId}`;
}

function orgMailer() {
  return createMailer({
    env: mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog("org", "org_mail"),
  });
}

const INVITE_DAYS = 14;

/**
 * Invite someone to a seat, or send an open invitation again with a fresh
 * link. Runs as the signed-in owner (or staff); 0024 decides whether they
 * may, holds a place on the licence and applies the send limits.
 */
export async function sendSeatInvite(a: {
  origin: string;
  licenceId: string;
  orgName: string;
  email: string;
  resendId?: string | null;
}): Promise<OrgNotice> {
  const token = mintToken();
  const hash = await hashToken(token);
  const supabase = await createUserClient();
  const { error } = a.resendId
    ? await supabase.rpc("org_seat_invite_resend", { p_invite: a.resendId, p_token_hash: hash })
    : await supabase.rpc("org_seat_invite", { p_licence: a.licenceId, p_email: a.email, p_token_hash: hash });
  if (error) {
    console.error("org_seat_invite_failed", error.code ?? "");
    return orgErrorNotice(error.code);
  }
  const url = seatJoinUrl(a.origin, token);
  try {
    const sent = await orgMailer().sendOrganisation(
      "seat_invite",
      {
        organisationName: a.orgName,
        supportEmail: process.env.EMAIL_REPLY_TO ?? "",
        acceptUrl: url,
        declineUrl: `${url}?decline=1`,
        expiresOn: formatOrgDate(new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString()),
      },
      { to: a.email },
    );
    if (sent.status === "failed" || sent.status === "refused") {
      console.error("org_seat_invite_mail_failed", sent.reason ?? "");
      return "invited_no_mail";
    }
  } catch (e) {
    console.error("org_seat_invite_mail_failed", e instanceof Error ? e.name : "unknown");
    return "invited_no_mail";
  }
  return a.resendId ? "resent" : "invited";
}

/**
 * Staff invite the person who will run a customer organisation, as its
 * owner, through the 0013 invitation (staff alone may invite an owner).
 * The email and the join page are this feature's own, so a church or a
 * business is never told it is "publishing".
 */
export async function sendAdminInvite(a: { origin: string; orgId: string; orgName: string; email: string }): Promise<OrgNotice> {
  const token = mintToken();
  const hash = await hashToken(token);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_invite", { p_org: a.orgId, p_email: a.email, p_role: "owner", p_author: null, p_token_hash: hash });
  if (error) {
    console.error("org_admin_invite_failed", error.code ?? "");
    return orgErrorNotice(error.code);
  }
  try {
    const sent = await orgMailer().sendOrganisation(
      "admin_invite",
      { organisationName: a.orgName, supportEmail: process.env.EMAIL_REPLY_TO ?? "", acceptUrl: adminJoinUrl(a.origin, token), consoleUrl: `${a.origin}/org` },
      { to: a.email },
    );
    if (sent.status === "failed" || sent.status === "refused") return "invited_no_mail";
  } catch {
    return "invited_no_mail";
  }
  return "invited";
}
