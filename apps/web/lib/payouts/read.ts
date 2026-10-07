import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { isPayoutStatus, type PayoutStatus } from "@/lib/payouts/status";
import { hasRecentStepUp, totpAgeSeconds } from "@/lib/payouts/step-up";

/**
 * What a payee page needs to show (F-099, F-143). User client only, so
 * everything here runs under row level security: a member sees their own
 * organisations and nobody else's. Pages may import this module; the
 * service role lives in lib/payouts/connect.ts, which only actions and route
 * handlers import.
 */

export interface PayoutOrganisation {
  orgId: string;
  displayName: string;
  kind: string;
  country: string | null;
  status: PayoutStatus;
  /** True when Stripe holds an account for this organisation. The id itself is not passed to pages. */
  hasAccount: boolean;
  taxResidence: string | null;
  treatyClaimed: boolean | null;
  /** Owner or finance: may connect payouts and change tax details. */
  canManage: boolean;
  role: string;
  /** Akana-owned or demo: not paid through Connect. */
  exempt: boolean;
}

export interface StepUpState {
  signedIn: boolean;
  userId: string | null;
  hasAuthenticator: boolean;
  recent: boolean;
  /** Seconds since the last authenticator code on this session, or null. */
  ageSeconds: number | null;
}

const PAYOUT_ROLES = ["owner", "finance"];

/** The organisations whose payouts this person can see: those where they are owner or finance. */
export async function getPayoutOrganisations(): Promise<PayoutOrganisation[]> {
  const supabase = await createUserClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return [];

  const { data: memberships, error: mErr } = await supabase.from("org_members").select("org_id, role").eq("user_id", uid).in("role", PAYOUT_ROLES);
  if (mErr) {
    console.error("payout_memberships_read_failed", mErr.code ?? "");
    return [];
  }
  const roles = new Map<string, string>((memberships ?? []).map((m: { org_id: string; role: string }) => [m.org_id, m.role]));
  if (roles.size === 0) return [];

  const { data: orgs, error: oErr } = await supabase
    .from("organisations")
    .select("id, display_name, kind, country, connect_status, stripe_connect_id, tax_residence, treaty_declaration, is_demo")
    .in("id", [...roles.keys()])
    .order("display_name");
  if (oErr) {
    console.error("payout_organisations_read_failed", oErr.code ?? "");
    return [];
  }
  return (orgs ?? []).map((o: Record<string, unknown>) => {
    const role = roles.get(o.id as string) ?? "viewer";
    const decl = (o.treaty_declaration ?? null) as { claimed?: unknown } | null;
    return {
      orgId: o.id as string,
      displayName: (o.display_name as string) ?? "",
      kind: (o.kind as string) ?? "",
      country: (o.country as string | null) ?? null,
      status: isPayoutStatus(o.connect_status) ? o.connect_status : "not_started",
      hasAccount: typeof o.stripe_connect_id === "string" && o.stripe_connect_id !== "",
      taxResidence: (o.tax_residence as string | null) ?? null,
      treatyClaimed: typeof decl?.claimed === "boolean" ? decl.claimed : null,
      canManage: PAYOUT_ROLES.includes(role),
      role,
      exempt: o.kind === "akana_house" || o.is_demo === true,
    };
  });
}

/** Whether this session has a recent authenticator code, and whether one is set up at all. */
export async function getStepUpState(nowMs: number = Date.now()): Promise<StepUpState> {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : (data?.claims as Record<string, unknown> | undefined);
  const userId = typeof claims?.sub === "string" && claims.sub ? claims.sub : null;
  if (!userId) return { signedIn: false, userId: null, hasAuthenticator: false, recent: false, ageSeconds: null };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return {
    signedIn: true,
    userId,
    hasAuthenticator: (factors?.totp.length ?? 0) > 0,
    recent: hasRecentStepUp(claims, nowMs),
    ageSeconds: totpAgeSeconds(claims, nowMs),
  };
}
