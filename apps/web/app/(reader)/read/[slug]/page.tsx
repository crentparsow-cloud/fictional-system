import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import "@akana/engine/engine.css";
import { getReaderSession } from "@/lib/auth";
import { consentGate, consentHref } from "@/lib/consent";
import { marketFor } from "@/lib/markets";
import { PRICE_LADDER, priceFor, pricePointFromRow, type Price, type PricePoint, type PricePointId } from "@/lib/pricing";
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
 * Then, inside the Player:
 *   higher   the Start screen and its "I have read this" before unit 1 (F-022)
 *   paywall  a unit the entitlement does not cover shows the calm card (F-019)
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

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
  current_version_id: string | null;
}

interface PricePointRow {
  id: string;
  kind: string;
  amounts: unknown;
  stripe_price_id: string | null;
  active: boolean;
}

const MEMBERSHIP_POINT: PricePointId = "member_month";

interface EnrolmentRow {
  id: string;
  version_id: string;
  status: string;
}

export default async function ReadPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const session = await getReaderSession();
  if (!session) notFound(); // the (reader) layout redirects first; this keeps the types honest
  const tenantId = await tenantIdForRequest();
  if (!tenantId) notFound();

  const supabase = await createUserClient();

  const { data: wb } = await supabase
    .from("workbooks")
    .select("id, slug, title, safety_tier, is_demo, price_point_id, current_version_id")
    .eq("slug", slug)
    .maybeSingle();
  const workbook = wb as WorkbookRow | null;
  if (!workbook || !workbook.current_version_id) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("health_consent_at, country")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (consentGate(workbook.safety_tier, { consentAt: (profile?.health_consent_at as string | null | undefined) ?? null }) === "consent") {
    redirect(consentHref(`/read/${workbook.slug}`));
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
  let workbookPrice: Price | null = null;
  let membershipPrice: Price | null = null;
  if (rebuilt.lockedUnits.length && !workbook.is_demo) {
    const ids = [MEMBERSHIP_POINT, ...(workbook.price_point_id ? [workbook.price_point_id] : [])];
    const { data: points } = await supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").in("id", ids);
    const ladder: Partial<Record<PricePointId, PricePoint>> = { ...PRICE_LADDER };
    for (const row of (points ?? []) as PricePointRow[]) {
      const point = pricePointFromRow(row);
      if (point) ladder[point.id] = point.active ? point : { ...point, amounts: {} };
    }
    workbookPrice = priceFor({ pricePointId: workbook.price_point_id, isDemo: workbook.is_demo }, market, ladder);
    membershipPrice = priceFor({ pricePointId: MEMBERSHIP_POINT }, market, ladder);
  }

  return (
    <ReadClient
      workbook={rebuilt.workbook}
      enrolmentId={enrolment.id}
      lockedUnits={rebuilt.lockedUnits}
      missing={rebuilt.missing}
      slug={workbook.slug}
      market={market.code}
      paywall={{ demo: workbook.is_demo, workbookPrice, membershipPrice }}
    />
  );
}
