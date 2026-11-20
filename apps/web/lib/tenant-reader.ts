import "server-only";
import { headers } from "next/headers";
import { HEALTH_CONSENT_VERSION } from "@/lib/consent";
import { getScopedUser, type UserClient } from "@/lib/session-scope-server";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * The reader on a tenant host (F-133). Everything a tenant page or route
 * needs to know about who is signed in comes from here.
 *
 * The tenant is the one the proxy resolved (headers it alone may set), never
 * a value from the browser. The session passes the central scope check
 * (lib/session-scope-server.ts). The gates are read through
 * public.tenant_reader_gates (migration 0073): a tenant session has no
 * access to profiles, so the database answers with four booleans about the
 * reader's own account and nothing else: no dates, no versions, and nothing
 * the tenant site cannot act on (R2-6).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

export interface TenantRequest {
  tenantId: string;
  /** The verified host, as the proxy resolved it. Recorded with the session, so a stopped host takes its sessions with it. */
  host: string;
  /** True when reader sign-in is on for this tenant. */
  signIn: boolean;
}

/** The white-label tenant of this request, or null on the marketplace or with no tenant id. */
export async function tenantRequest(): Promise<TenantRequest | null> {
  const h = await headers();
  if (h.get("x-akana-tenant-kind") !== "white_label") return null;
  const tenantId = (h.get("x-akana-tenant-id") ?? "").toLowerCase();
  const host = h.get("x-akana-tenant-host") ?? "";
  if (!UUID.test(tenantId) || !HOST.test(host)) return null;
  return { tenantId, host, signIn: h.get("x-akana-tenant-sign-in") === "1" };
}

export interface TenantGates {
  adultConfirmed: boolean;
  /** The reader's latest acceptance is the current reader terms. */
  termsAccepted: boolean;
  /** Consent to the current health data wording is on the account. */
  healthConsent: boolean;
  /**
   * The account cannot be added to from this site right now. The database
   * says can_write and no more; the reason stays on the Akana site.
   */
  readOnly: boolean;
}

interface GateRow {
  adult_confirmed: boolean | null;
  terms_accepted: boolean | null;
  health_consent: boolean | null;
  can_write: boolean | null;
}

/**
 * The reader's gates, or null when they could not be read. Callers refuse on
 * null. The database answers with booleans only: a tenant session learns no
 * dates and no versions about the account, and nothing about faith consent
 * (it is not taken on a tenant site). Unknown is the closed answer
 * everywhere: not passed, and read only.
 */
export async function loadTenantGates(supabase: UserClient): Promise<TenantGates | null> {
  try {
    const { data, error } = await supabase.rpc("tenant_reader_gates");
    if (error) {
      console.error("tenant_gates_failed", error.code ?? "");
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as GateRow | null | undefined;
    if (!row) return null;
    return {
      adultConfirmed: row.adult_confirmed === true,
      termsAccepted: row.terms_accepted === true,
      healthConsent: row.health_consent === true,
      // Anything but a plain true is read only: a pending deletion must never be written through.
      readOnly: row.can_write !== true,
    };
  } catch {
    console.error("tenant_gates_failed", "exception");
    return null;
  }
}

/** The gate a reader must pass before reading, in the order the reader layout uses (F-127, F-122). */
export function nextTenantGate(gates: Pick<TenantGates, "adultConfirmed" | "termsAccepted">): "welcome" | "terms" | null {
  if (!gates.adultConfirmed) return "welcome";
  if (!gates.termsAccepted) return "terms";
  return null;
}

/**
 * What to tell the reader when a tenant reader function refuses a write.
 * AKH09: health consent was withdrawn once, so it is given again on the
 * Akana site only (R2-1). AKR01: the account is read only (R2-3). Both send
 * the reader to the Akana site; neither says more than that.
 */
export function tenantWriteErrorCode(code: string | null | undefined): "akana" | "readonly" | "save" {
  if (code === "AKH09") return "akana";
  if (code === "AKR01") return "readonly";
  return "save";
}

/** /welcome asks for whichever of the two is missing; it carries the path to return to. */
export function tenantGateHref(next: string): string {
  return `/welcome?next=${encodeURIComponent(next)}`;
}

export interface TenantReader {
  userId: string;
  email: string | null;
  tenantId: string;
  host: string;
  supabase: UserClient;
}

/**
 * The signed-in reader of this tenant, or null. Null when sign-in is off for
 * the tenant, on the marketplace, with no session, and with a session that is
 * not scoped to this tenant.
 */
export async function getTenantReader(): Promise<TenantReader | null> {
  const req = await tenantRequest();
  if (!req || !req.signIn) return null;
  const scoped = await getScopedUser();
  if (!scoped || scoped.scope !== "tenant" || scoped.tenantId !== req.tenantId) return null;
  return { userId: scoped.user.id, email: scoped.user.email ?? null, tenantId: req.tenantId, host: req.host, supabase: scoped.supabase };
}

/**
 * What /api/answers needs to decide a write for a tenant-scoped session: the
 * pending-deletion state and the consents (from the gates), and the
 * workbook's tier and shelf (public facts, read with no session). The shapes
 * match what the route reads for an Akana session, so the same decisions run
 * on them: a consent the database says is current is given as the current
 * version, anything else as none. Faith consent is never known here, so a
 * faith workbook is refused. Null when anything could not be read: the
 * route refuses.
 */
export interface TenantAnswerFacts {
  readOnly: boolean;
  workbook: { safety_tier: string | null; genre_id: string | null; themes: { shelf_id: string | null } | null };
  profile: { health_consent_at: string | null; health_consent_version: string | null; faith_consent_at: string | null; faith_consent_version: string | null };
}

export async function tenantAnswerFacts(supabase: UserClient, workbookId: string): Promise<TenantAnswerFacts | null> {
  try {
    const [gates, { data, error }] = await Promise.all([
      loadTenantGates(supabase),
      createAnonClient().from("workbooks").select("safety_tier, genre_id, themes(shelf_id)").eq("id", workbookId).maybeSingle(),
    ]);
    if (!gates || error || !data) return null;
    const given = new Date(0).toISOString();
    return {
      readOnly: gates.readOnly,
      workbook: data as unknown as TenantAnswerFacts["workbook"],
      profile: {
        health_consent_at: gates.healthConsent ? given : null,
        health_consent_version: gates.healthConsent ? HEALTH_CONSENT_VERSION : null,
        faith_consent_at: null,
        faith_consent_version: null,
      },
    };
  } catch {
    return null;
  }
}
