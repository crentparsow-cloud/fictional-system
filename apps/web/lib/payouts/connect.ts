import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import type { ConnectRepo } from "@/lib/payouts/connect-webhook";
import { accountCreateParams, accountIdempotencyKey, connectStatusFromAccount, isUuid, onboardingUrls } from "@/lib/payouts/status";

/**
 * Connect Express onboarding (F-099), the server part. Stripe test mode
 * only until the live_payments flag and gate O7 clear.
 *
 * Order of a start:
 *  1. public.begin_payout_change with the user's own client. The database
 *     checks owner or finance, a recent authenticator code (F-143), the
 *     daily limit and the country, and writes the audit row. Nothing goes
 *     to Stripe unless it says yes.
 *  2. With the service role: create the Express account once (idempotency
 *     key per organisation) and link it through public.record_connect_account.
 *  3. An account link for onboarding, or, once verified, a login link to
 *     the Express dashboard, where bank details are changed.
 *
 * Only actions and route handlers import this module.
 */

export type StartResult =
  | { kind: "redirect"; url: string }
  | { kind: "held" }
  | { kind: "step_up" }
  | { kind: "error"; code: string };

export async function startConnectOnboarding(orgId: string, origin: string): Promise<StartResult> {
  if (!isUuid(orgId)) return { kind: "error", code: "AKY02" };
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("begin_payout_change", { p_org: orgId });
  if (error) {
    if (error.code === "AKY03") return { kind: "step_up" };
    console.warn("payout_begin_refused", error.code ?? "");
    return { kind: "error", code: error.code ?? "unknown" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { org_id: string; kind: string; country: string; stripe_connect_id: string | null; connect_status: string }
    | undefined;
  if (!row) return { kind: "error", code: "unknown" };
  if (row.connect_status === "held") return { kind: "held" };

  const stripe = getStripe();
  const admin = createAdminClient();
  let accountId = row.stripe_connect_id;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create(accountCreateParams({ orgId, kind: row.kind, country: row.country }), {
        idempotencyKey: accountIdempotencyKey(orgId),
      });
      const { error: linkErr } = await admin.rpc("record_connect_account", { p_org: orgId, p_account: account.id });
      if (linkErr) throw new Error(`record_connect_account failed: ${linkErr.code ?? linkErr.message}`);
      accountId = account.id;
    }
    if (row.connect_status === "verified") {
      const login = await stripe.accounts.createLoginLink(accountId);
      return { kind: "redirect", url: login.url };
    }
    const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding", ...onboardingUrls(origin, orgId) });
    return { kind: "redirect", url: link.url };
  } catch (err) {
    console.error("payout_connect_failed", { org: orgId, reason: err instanceof Error ? err.name : "unknown" });
    return { kind: "error", code: "stripe" };
  }
}

/**
 * After the payee comes back from Stripe: read the account fresh and bring
 * the status into line, without waiting for the webhook. The user client
 * read proves the caller belongs to the organisation.
 */
export async function syncOrganisationFromStripe(orgId: string): Promise<boolean> {
  if (!isUuid(orgId)) return false;
  const supabase = await createUserClient();
  const { data: org } = await supabase.from("organisations").select("id, stripe_connect_id").eq("id", orgId).maybeSingle();
  const accountId = (org?.stripe_connect_id as string | null | undefined) ?? null;
  if (!accountId) return false;
  try {
    const account = await getStripe().accounts.retrieve(accountId);
    const { error } = await createAdminClient().rpc("sync_connect_status", {
      p_account: accountId,
      p_status: connectStatusFromAccount(account),
      p_observed_at: new Date().toISOString(),
    });
    if (error) throw new Error(`sync_connect_status failed: ${error.code ?? error.message}`);
    return true;
  } catch (err) {
    console.error("payout_sync_failed", { org: orgId, reason: err instanceof Error ? err.name : "unknown" });
    return false;
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** The Connect repository over the service role client, for the webhook route. */
export function connectRepo(admin: Admin, stripe: Stripe = getStripe()): ConnectRepo {
  return {
    async syncStatus(accountId, status, observedAt) {
      const { data, error } = await admin.rpc("sync_connect_status", { p_account: accountId, p_status: status, p_observed_at: observedAt });
      if (error) throw new Error(`sync_connect_status failed: ${error.code ?? error.message}`);
      const row = (Array.isArray(data) ? data[0] : data) as { result: string; org_id: string | null } | undefined;
      const result = (row?.result ?? "unlinked") as "applied" | "unchanged" | "stale" | "unlinked";
      return { result, orgId: row?.org_id ?? null };
    },
    async noteDetailsChanged(accountId, change, eventId) {
      const { data, error } = await admin.rpc("note_payout_details_changed", { p_account: accountId, p_change: change, p_event: eventId });
      if (error) throw new Error(`note_payout_details_changed failed: ${error.code ?? error.message}`);
      return (data as string | null) ?? null;
    },
    async retrieveAccount(accountId) {
      try {
        return await stripe.accounts.retrieve(accountId);
      } catch {
        return null;
      }
    },
  };
}

/** The public origin for links, from the configured host or the request headers. */
export function originFrom(headers: Headers): string {
  const host = process.env.AKANA_HOST ?? headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
