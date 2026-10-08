import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createMailer, type SendResult } from "@akana/emails";
import { getReaderSession } from "@/lib/auth";
import { mailLog } from "@/lib/mail-ops";
import { mailerEnvFromProcess } from "@/lib/partner-mail";
import { createUserClient } from "@/lib/supabase/server";
import { ORG_FILES_BUCKET } from "@/lib/storage/file-rules";
import { LICENCE_FILE, LICENCE_VERSION, hashToken, isUuid, joinUrl, mintToken, studioErrorNotice, type LicenceTextRow, type OrgRole, type StudioNotice } from "@/lib/studio";

/**
 * Server side of the Studio and console. Everything reads through the
 * signed-in user's client, so row level security and the 0013 functions
 * decide what comes back. No service role here.
 */

export interface StudioOrg {
  id: string;
  displayName: string;
  kind: string;
  role: string;
  isDemo: boolean;
  connectStatus: string;
}

export interface StudioContext {
  userId: string;
  email: string | null;
  orgs: StudioOrg[];
  org: StudioOrg;
  multi: boolean;
}

type MemberRow = {
  role: string;
  organisations: { id: string; display_name: string; kind: string; is_demo: boolean; connect_status: string } | null;
};

const CUSTOMER_KINDS = new Set(["business", "church", "charity", "community_group"]);

export const getMemberships = cache(async function getMemberships(userId: string): Promise<StudioOrg[]> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("role, organisations(id, display_name, kind, is_demo, connect_status)")
    .eq("user_id", userId);
  if (error) console.error("studio_memberships_failed", error.code ?? "");
  return ((data ?? []) as unknown as MemberRow[])
    // Customer organisations (0024: business, church, charity, community_group) use /org, not the Studio.
    .filter((r) => r.organisations && r.organisations.kind !== "akana_house" && !CUSTOMER_KINDS.has(r.organisations.kind))
    .map((r) => ({
      id: r.organisations!.id,
      displayName: r.organisations!.display_name,
      kind: r.organisations!.kind,
      role: r.role,
      isDemo: r.organisations!.is_demo,
      connectStatus: r.organisations!.connect_status,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
});

/**
 * For Studio and console pages: the signed-in person and the organisation
 * they are working in. Signed out goes to sign-in. Someone with no
 * organisation sees a 404, because the Studio is invite only.
 */
export async function requireStudio(next: string, orgParam?: string | string[]): Promise<StudioContext> {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const orgs = await getMemberships(session.userId);
  if (orgs.length === 0) notFound();
  const wanted = Array.isArray(orgParam) ? orgParam[0] : orgParam;
  const org = (isUuid(wanted) && orgs.find((o) => o.id === wanted)) || orgs[0]!;
  return { userId: session.userId, email: session.email, orgs, org, multi: orgs.length > 1 };
}

// ---------------------------------------------------------------------------
// The licence text on file
// ---------------------------------------------------------------------------

// apps/web is two levels below the repo root, where docs/legal lives.
const LEGAL_DIR = path.join(process.cwd(), "..", "..", "docs", "legal");

export interface LicenceFile {
  version: string;
  markdown: string;
  sha256: string;
}

/** The licence text as a lawyer draft file, and the hash of its exact bytes. */
export const readLicenceFile = cache(function readLicenceFile(): LicenceFile | null {
  try {
    const raw = readFileSync(path.join(LEGAL_DIR, LICENCE_FILE));
    return { version: LICENCE_VERSION, markdown: raw.toString("utf8"), sha256: createHash("sha256").update(raw).digest("hex") };
  } catch {
    console.error("licence_file_missing");
    return null;
  }
});

export const readLicenceTextRow = cache(async function readLicenceTextRow(version: string): Promise<LicenceTextRow | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("licence_texts")
    .select("version, status, is_placeholder, content_sha256")
    .eq("version", version)
    .maybeSingle();
  if (error) console.error("licence_text_read_failed", error.code ?? "");
  return (data as LicenceTextRow | null) ?? null;
});

// ---------------------------------------------------------------------------
// Email: the invitation and the submission status (packages/emails author.ts)
// ---------------------------------------------------------------------------

function studioMailer() {
  return createMailer({
    env: mailerEnvFromProcess(),
    isSuppressed: () => false,
    log: mailLog("studio", "studio_mail"),
  });
}

export async function sendInviteEmail(a: {
  origin: string;
  to: string;
  token: string;
  inviterName: string;
  organisationName: string;
}): Promise<SendResult> {
  const env = mailerEnvFromProcess();
  return studioMailer().sendAuthor(
    "invite",
    {
      inviterName: a.inviterName,
      organisationName: a.organisationName,
      acceptUrl: joinUrl(a.origin, a.token),
      studioUrl: `${a.origin}/studio`,
      supportEmail: env.EMAIL_REPLY_TO ?? "",
    },
    { to: a.to },
  );
}

export async function sendSubmissionEmail(a: { origin: string; to: string; workbookTitle: string; submissionId: string }): Promise<SendResult> {
  const env = mailerEnvFromProcess();
  const submittedAt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date());
  return studioMailer().sendAuthor(
    "submission_received",
    { workbookTitle: a.workbookTitle, submittedAt, studioUrl: `${a.origin}/studio`, supportEmail: env.EMAIL_REPLY_TO ?? "" },
    { to: a.to, dedupeKey: `submission_received:${a.submissionId}` },
  );
}

// ---------------------------------------------------------------------------
// Private files: size and hash of an uploaded file, read under the caller's
// own storage policy (F-135). Null when the caller may not read it.
// ---------------------------------------------------------------------------

export async function privateFileDigest(p: string): Promise<{ size: number; sha256: string } | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.storage.from(ORG_FILES_BUCKET).createSignedUrl(p, 60);
  if (error || !data) return null;
  try {
    const res = await fetch(data.signedUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { size: buf.byteLength, sha256: createHash("sha256").update(buf).digest("hex") };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Invitations (F-033, F-055): mint, store the hash, email the link.
// ---------------------------------------------------------------------------

/** The name an invitation email gives for the person who sent it. */
export async function inviterName(fallback: string): Promise<string> {
  const supabase = await createUserClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return fallback;
  const { data } = await supabase.from("profiles").select("display_name").eq("user_id", user.user.id).maybeSingle();
  const name = (data?.display_name as string | null | undefined)?.trim();
  return name || fallback;
}

/**
 * Invite someone, or send an open invitation again. The plain token goes
 * only into the email; the database keeps its hash. Runs as the signed-in
 * person, and the 0013 function decides whether they may.
 */
export async function sendOrgInvite(a: {
  origin: string;
  orgId: string;
  orgName: string;
  email: string;
  role: OrgRole;
  authorId?: string | null;
  inviter: string;
  resendId?: string | null;
}): Promise<StudioNotice> {
  const token = mintToken();
  const hash = await hashToken(token);
  const supabase = await createUserClient();
  const { error } = a.resendId
    ? await supabase.rpc("org_invite_resend", { p_invite: a.resendId, p_token_hash: hash })
    : await supabase.rpc("org_invite", { p_org: a.orgId, p_email: a.email, p_role: a.role, p_author: a.authorId ?? null, p_token_hash: hash });
  if (error) {
    console.error("studio_invite_failed", error.code ?? "");
    return studioErrorNotice(error.code, error.message);
  }
  try {
    const sent = await sendInviteEmail({ origin: a.origin, to: a.email, token, inviterName: a.inviter, organisationName: a.orgName });
    if (sent.status === "failed") console.error("studio_invite_mail_failed", sent.reason ?? "");
  } catch (e) {
    console.error("studio_invite_mail_failed", e instanceof Error ? e.name : "unknown");
  }
  return a.resendId ? "resent" : "invited";
}
