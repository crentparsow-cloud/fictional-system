"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CSV_MAX_BYTES, joinLinkUrl, parseInviteCsv, parseInviteList, parseJoinLinkForm, billingErrorNotice, BILLING_NOTICES } from "@/lib/org-billing";
import { ORG_NOTICES } from "@/lib/org-pilot";
import { hashToken, mintToken, originFrom } from "@/lib/partner";
import { requireOrgConsole, sendSeatInvite, withOrgParam } from "@/lib/org-pilot-server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Bulk invitations and join links (F-225). The CSV is read in memory for
 * the preview and never stored; sending goes through 0024's
 * org_seat_invite one address at a time, so its daily limit, its three in
 * 30 days per address rule and the list of people who said no all apply.
 * A join link's token goes to the owner once, on screen; the database keeps
 * its hash.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CsvState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "preview";
      valid: string[];
      invalid: { line: number; value: string }[];
      duplicates: number;
      truncated: boolean;
      placesLeft: number;
      sendsLeft: number;
    }
  | { status: "sent"; sent: number; notSent: { email: string; reason: string }[] };

export type LinkState = { status: "idle" } | { status: "error"; message: string } | { status: "made"; url: string };

interface OpenLicence {
  id: string;
  seats_purchased: number;
  orgName: string;
}

/** The licence, if it belongs to the organisation and the caller owns it. */
async function ownedLicence(formData: FormData): Promise<OpenLicence | null> {
  const ctx = await requireOrgConsole("/org/invite", String(formData.get("org") ?? ""));
  if (ctx.org.role !== "owner") return null;
  const id = String(formData.get("licence") ?? "");
  if (!UUID.test(id)) return null;
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("org_licences")
    .select("id, seats_purchased, status")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { id: data.id as string, seats_purchased: data.seats_purchased as number, orgName: ctx.org.displayName };
}

async function quota(licenceId: string): Promise<{ placesLeft: number; sendsLeft: number } | null> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("org_invite_quota", { p_licence: licenceId });
  const row = (Array.isArray(data) ? data[0] : data) as { places_left: number; sends_left_today: number } | undefined;
  if (error || !row) return null;
  return { placesLeft: row.places_left, sendsLeft: row.sends_left_today };
}

export async function previewInviteCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const licence = await ownedLicence(formData);
  if (!licence) return { status: "error", message: ORG_NOTICES.denied.text };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choose a CSV file first." };
  if (file.size > CSV_MAX_BYTES) return { status: "error", message: "That file is too big. Keep it to 200 addresses." };
  const text = await file.text();
  const parsed = parseInviteCsv(text);
  const q = await quota(licence.id);
  if (!q) return { status: "error", message: ORG_NOTICES.failed.text };
  return { status: "preview", ...parsed, placesLeft: q.placesLeft, sendsLeft: q.sendsLeft };
}

const REASONS: Record<string, string> = {
  exists: "Already has a seat or an invitation.",
  blocked: "Asked not to be invited by your organisation.",
  limited: "Not sent: the limit for today was reached, or this address had three invitations in 30 days.",
  no_seats: "Not sent: no places left.",
  invalid: "Not a usable address.",
  invited_no_mail: "Saved, but the email did not send. Use Send again on the Seats page.",
};

export async function sendInviteCsv(_prev: CsvState, formData: FormData): Promise<CsvState> {
  const licence = await ownedLicence(formData);
  if (!licence) return { status: "error", message: ORG_NOTICES.denied.text };
  const list = parseInviteList(formData.get("emails"));
  if (!list) return { status: "error", message: ORG_NOTICES.invalid.text };
  const origin = originFrom(await headers());
  let sent = 0;
  const notSent: { email: string; reason: string }[] = [];
  let stop: string | null = null;
  for (const email of list) {
    if (stop) {
      notSent.push({ email, reason: REASONS[stop] ?? ORG_NOTICES.failed.text });
      continue;
    }
    const n = await sendSeatInvite({ origin, licenceId: licence.id, orgName: licence.orgName, email });
    if (n === "invited") sent++;
    else {
      notSent.push({ email, reason: REASONS[n] ?? ORG_NOTICES.failed.text });
      if (n === "no_seats" || n === "denied" || n === "state") stop = n;
      // The daily limit stops the run; the 30-day rule is per address, so carry on.
    }
  }
  revalidatePath("/org");
  return { status: "sent", sent, notSent };
}

export async function createJoinLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const licence = await ownedLicence(formData);
  if (!licence) return { status: "error", message: BILLING_NOTICES.denied.text };
  const input = parseJoinLinkForm((k) => formData.get(k), licence.seats_purchased);
  if (!input) return { status: "error", message: BILLING_NOTICES.invalid.text };
  const token = mintToken();
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_join_link_create", {
    p_licence: licence.id,
    p_token_hash: await hashToken(token),
    p_days: input.days,
    p_max_uses: input.maxUses,
    p_domain: input.domain,
  });
  if (error) {
    console.error("org_join_link_create_failed", error.code ?? "");
    return { status: "error", message: BILLING_NOTICES[billingErrorNotice(error.code)].text };
  }
  revalidatePath("/org/invite");
  return { status: "made", url: joinLinkUrl(originFrom(await headers()), token) };
}

export async function revokeJoinLink(formData: FormData): Promise<void> {
  const ctx = await requireOrgConsole("/org/invite", String(formData.get("org") ?? ""));
  const id = String(formData.get("link") ?? "");
  const back = withOrgParam("/org/invite", ctx.org.id, ctx.multi);
  const sep = back.includes("?") ? "&" : "?";
  if (!UUID.test(id)) redirect(`${back}${sep}notice=invalid`);
  const supabase = await createUserClient();
  const { error } = await supabase.rpc("org_join_link_revoke", { p_link: id });
  if (error) redirect(`${back}${sep}notice=${billingErrorNotice(error.code)}`);
  revalidatePath("/org/invite");
  redirect(`${back}${sep}notice=link_closed`);
}
