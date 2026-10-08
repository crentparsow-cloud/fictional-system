import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import "@akana/engine/engine.css";
import { readerDeletion } from "@/lib/account-server";
import { getReaderSession } from "@/lib/auth";
import { consentGate, consentHref, faithConsentGate, faithConsentHref } from "@/lib/consent";
import { countView } from "@/lib/funnel-server";
import { marketFor } from "@/lib/markets";
import { membershipPlansOpen } from "@/lib/membership";
import { PRICE_LADDER, marketPriceFor, pricePointFromRow, type Price, type PricePoint, type PricePointId } from "@/lib/pricing";
import { rebuildWorkbook, type SectionRow } from "@/lib/rebuild-workbook";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { ReadClient } from "./ReadClient";

/**
 * The reader: a published workbook in the engine with sealed answers (T3).
 *
 * Everything is read through the reader's own client, so RLS decides what
 * they see: the listing, start, free units and safety hub of a public
 * workbook, plus whatever an entitlement unlocks once commerce lands. An
 * enrolment is created on first open, pinned to the current version, and
 * last_opened_at is touched on every open. The page never reads answers;
 * the client loads them from /api/answers once it mounts.
 *
 * Gates, in order, before any enrolment is created:
 *   consent  a wellbeing workbook (tier standard or higher) sends a reader
 *            with no health data consent to /consent first (F-026). Tier
 *            none never asks.
 *   faith    a workbook on the Faith and Spirituality shelf sends a reader
 *            with no faith consent to /consent/faith (F-150).
 * Then, inside the Player:
 *   higher   the Start screen and its "I have read this" before unit 1 (F-022),
 *            kept server side per enrolment and version (0026)
 *   paywall  a unit the entitlement does not cover shows the calm card (F-019)
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = { view?: string | string[] };

/** Views a link may open straight to, such as Today's daily check link. Units and Start are not among them. */
const OPEN_VIEWS = ["daily", "plan", "progress", "toolkit", "finish", "keep_going"] as const;
type OpenView = (typeof OPEN_VIEWS)[number];

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createUserClient();
  const { data } = await supabase.from("workbooks").select("short_title, title").eq("slug", slug).maybeSingle();
  // The tab title is the catalogue title. Nothing else about the reader is in it.
  return { title: (data?.short_title as string | null) ?? (data?.title as string | null) ?? "Workbook", robots: { index: false, follow: false } };
}

interface WorkbookRow {
  id: string;
  slug: string;
  title: string;
  safety_tier: "none" | "standard" | "higher";
  is_demo: boolean;
  price_point_id: string | null;
  in_membership: boolean;
  current_version_id: string | null;
  genre_id: string;
  /** The Theme's shelf, for the faith consent gate (F-150). */
  themes: { shelf_id: string | null } | null;
}

interface PricePointRow {
  id: string;
  kind: string;
  amounts: unknown;
  stripe_price_id: string | null;
  active: boolean;
}

const MEMBERSHIP_POINT: PricePointId = "member_month";
const MEMBERSHIP_YEARLY_POINT: PricePointId = "member_year";

interface EnrolmentRow {
  id: string;
  version_id: string;
  status: string;
}

export default async function ReadPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawView = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const openView = (OPEN_VIEWS as readonly string[]).includes(rawView ?? "") ? (rawView as OpenView) : null;
  const session = await getReaderSession();
  if (!session) notFound(); // the (reader) layout redirects first; this keeps the types honest
  const tenantId = await tenantIdForRequest();
  if (!tenantId) notFound();

  const supabase = await createUserClient();

  const { data: wb } = await supabase
    .from("workbooks")
    .select("id, slug, title, safety_tier, is_demo, price_point_id, in_membership, current_version_id, genre_id, themes(shelf_id)")
    .eq("slug", slug)
    .maybeSingle();
  const workbook = wb as unknown as WorkbookRow | null;
  if (!workbook || !workbook.current_version_id) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("health_consent_at, health_consent_version, faith_consent_at, faith_consent_version, country")
    .eq("user_id", session.userId)
    .maybeSingle();
  const consent = {
    consentAt: (profile?.health_consent_at as string | null | undefined) ?? null,
    consentVersion: (profile?.health_consent_version as string | null | undefined) ?? null,
  };
  if (consentGate(workbook.safety_tier, consent) === "consent") {
    redirect(consentHref(`/read/${workbook.slug}`));
  }
  // Faith consent (F-150): a workbook on the Faith and Spirituality shelf
  // asks for its own explicit consent, after the health one where both apply.
  const faithFacts = { shelfId: workbook.themes?.shelf_id ?? null, genreId: workbook.genre_id };
  const faithConsent = {
    consentAt: (profile?.faith_consent_at as string | null | undefined) ?? null,
    consentVersion: (profile?.faith_consent_version as string | null | undefined) ?? null,
  };
  if (faithConsentGate(faithFacts, faithConsent) === "faith-consent") {
    redirect(faithConsentHref(`/read/${workbook.slug}`));
  }
  const market = marketFor((profile?.country as string | null | undefined) ?? null);

  // One enrolment per reader, tenant and workbook. Create on first open.
  const { data: existing } = await supabase
    .from("enrolments")
    .select("id, version_id, status")
    .eq("user_id", session.userId)
    .eq("tenant_id", tenantId)
    .eq("workbook_id", workbook.id)
    .maybeSingle();

  let enrolment = existing as EnrolmentRow | null;
  if (enrolment) {
    await supabase.from("enrolments").update({ last_opened_at: new Date().toISOString() }).eq("id", enrolment.id);
  } else {
    const { data: created, error } = await supabase
      .from("enrolments")
      .insert({ user_id: session.userId, tenant_id: tenantId, workbook_id: workbook.id, version_id: workbook.current_version_id })
      .select("id, version_id, status")
      .single();
    if (error || !created) notFound();
    enrolment = created as EnrolmentRow;
  }

  // Sections for the version this reader is pinned to, as RLS returns them.
  const { data: sectionRows } = await supabase
    .from("workbook_sections")
    .select("kind, unit_number, body, free")
    .eq("version_id", enrolment.version_id);
  const rebuilt = rebuildWorkbook((sectionRows ?? []) as SectionRow[]);
  if (!rebuilt) notFound();

  // Prices for the calm paywall, only when something is locked. The
  // database row wins, as at checkout; the config ladder is the fallback.
  // F-094: the market currency where a figure exists, otherwise GBP with a note.
  let workbookPrice: Price | null = null;
  let membershipPrice: Price | null = null;
  let membershipYearlyPrice: Price | null = null;
  if (rebuilt.lockedUnits.length && !workbook.is_demo) {
    const ids = [MEMBERSHIP_POINT, MEMBERSHIP_YEARLY_POINT, ...(workbook.price_point_id ? [workbook.price_point_id] : [])];
    const { data: points } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ids);
    const ladder: Partial<Record<PricePointId, PricePoint>> = { ...PRICE_LADDER };
    for (const row of (points ?? []) as PricePointRow[]) {
      const point = pricePointFromRow(row);
      if (point) ladder[point.id] = point.active ? point : { ...point, amounts: {} };
    }
    workbookPrice = marketPriceFor({ pricePointId: workbook.price_point_id, isDemo: workbook.is_demo }, market, ladder);
    membershipPrice = marketPriceFor({ pricePointId: MEMBERSHIP_POINT }, market, ladder);
    membershipYearlyPrice = marketPriceFor({ pricePointId: MEMBERSHIP_YEARLY_POINT }, market, ladder);
  }
  // Progress events for this enrolment: ids and timestamps only (F-020).
  // The Player works out progress and milestones from them (F-018).
  const { data: eventRows } = await supabase
    .from("progress_events")
    .select("kind, ref, at")
    .eq("enrolment_id", enrolment.id)
    .order("at", { ascending: true })
    .limit(5000);
  const events = ((eventRows ?? []) as { kind: string; ref: string | null; at: string }[]).map((e) => ({ kind: e.kind, ref: e.ref, at: e.at }));

  // F-022: "I have read this", kept server side for the pinned version
  // (0026). If it cannot be read the reader sees the note again, nothing worse.
  let acknowledged = false;
  if (workbook.safety_tier === "higher") {
    const { data: ack, error: ackError } = await supabase
      .from("enrolment_acknowledgements")
      .select("acknowledged_at")
      .eq("enrolment_id", enrolment.id)
      .eq("version_id", enrolment.version_id)
      .maybeSingle();
    acknowledged = !ackError && Boolean(ack);
  }

  // F-025: read only while an account deletion is pending.
  const { readOnly } = await readerDeletion(supabase, session.userId);

  // F-141: a reader without the full workbook is reading the free sample.
  // Ids only, and nothing is counted when they have opted out of counting.
  if (rebuilt.lockedUnits.length) await countView("sample_view", workbook.id);

  // Membership checkout opens per plan once its Stripe price id is set (F-097).
  const plansOpen = membershipPlansOpen();

  return (
    <ReadClient
      workbook={rebuilt.workbook}
      enrolmentId={enrolment.id}
      lockedUnits={rebuilt.lockedUnits}
      missing={rebuilt.missing}
      slug={workbook.slug}
      market={market.code}
      events={events}
      openView={openView}
      acknowledged={acknowledged}
      readOnly={readOnly}
      paywall={{
        demo: workbook.is_demo,
        workbookPrice,
        membershipPrice,
        membershipCheckoutReady: plansOpen.monthly,
        membershipYearlyPrice,
        membershipYearlyReady: plansOpen.yearly,
        inMembership: workbook.in_membership !== false,
      }}
    />
  );
}
