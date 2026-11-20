import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import "@akana/engine/engine.css";
import { withTitleCopy } from "@akana/schema";
import { TenantShell } from "@/components/tenant/TenantShell";
import { brand } from "@/lib/brand";
import { isFaithWorkbook } from "@/lib/consent";
import { rebuildWorkbook, type SectionRow } from "@/lib/rebuild-workbook";
import { siteOrigin } from "@/lib/site-url";
import { createAnonClient } from "@/lib/supabase/anon";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader, loadTenantGates, nextTenantGate, tenantGateHref } from "@/lib/tenant-reader";
import { tenantListing, type TenantSite } from "@/lib/tenant-site";
import { tenantPriceLine } from "@/lib/tenant-standards";
import { titleCopyFor } from "@/lib/title-copy";
import { TenantReadClient } from "./TenantReadClient";

/**
 * Reading on a tenant site (F-133). The proxy rewrites /read/<slug> on a
 * white-label host to here when sign-in is on for the tenant.
 *
 * Whose data is read with what:
 *   public   the tenant's listing and the workbook's public facts, with no
 *            session at all (lib/supabase/anon.ts)
 *   reader   the enrolment, the sections, the progress events and the gates,
 *            with the reader's tenant-scoped session. The database returns
 *            rows of this tenant only and opens only what is free here: the
 *            free part of a listed title, and every part of a demo title in
 *            the demo period (migration 0073).
 *
 * The tenant is the proxy's, in every query. The workbook must be in this
 * tenant's visible catalogue, or the page is a 404. One enrolment per
 * reader, tenant and workbook, pinned to the current version on first open.
 * The page never reads answers; the client loads them from /api/answers.
 *
 * Gates, in order: sign-in; 18 or over and the reader terms (/welcome);
 * health data consent for a wellbeing workbook (/consent, F-026). A workbook
 * that needs faith consent (F-150) cannot be read here yet. Nothing is sold
 * on a tenant site, so a locked part says so and offers no checkout.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workbook", robots: { index: false, follow: false } };

type Params = { slug: string };

interface WorkbookFacts {
  current_version_id: string | null;
  genre_id: string | null;
  themes: { shelf_id: string | null } | null;
}

function Notice({ site, title, children }: { site: TenantSite; title: string; children: React.ReactNode }) {
  return (
    <TenantShell site={site} reader>
      <section className="tenant-section">
        <h1>{title}</h1>
        {children}
        <p>
          <Link href="/">Back to {site.name}</Link>
        </p>
      </section>
    </TenantShell>
  );
}

export default async function TenantReadPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const here = `/read/${slug}`;

  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent(here)}`);

  // The workbook must be one this tenant lists. Public data, read with no session.
  let card: Awaited<ReturnType<typeof tenantListing>> = null;
  let facts: WorkbookFacts | null = null;
  try {
    card = await tenantListing(site.id, slug);
    if (card) {
      const { data, error } = await createAnonClient().from("workbooks").select("current_version_id, genre_id, themes(shelf_id)").eq("id", card.workbookId).maybeSingle();
      if (error) throw new Error(error.code ?? "workbook");
      facts = data as unknown as WorkbookFacts | null;
    }
  } catch (err) {
    console.error("tenant_read_catalogue_failed", err instanceof Error ? err.message : "unknown");
    return (
      <Notice site={site} title="This workbook is not available right now">
        <p>Please try again in a few minutes.</p>
      </Notice>
    );
  }
  if (!card) notFound();
  if (!facts?.current_version_id) notFound();

  const gates = await loadTenantGates(reader.supabase);
  if (!gates) {
    return (
      <Notice site={site} title="Something went wrong">
        <p>We could not check your account just now. Please try again in a few minutes.</p>
      </Notice>
    );
  }
  if (nextTenantGate(gates)) redirect(tenantGateHref(here));
  if (card.safetyTier !== "none" && !gates.healthConsent) redirect(`/consent?next=${encodeURIComponent(here)}`);
  // Faith consent (F-150) is not taken on a tenant site, and a tenant session is told nothing about it (R2-6).
  if (isFaithWorkbook({ shelfId: facts.themes?.shelf_id ?? null, genreId: facts.genre_id })) {
    return (
      <Notice site={site} title="This workbook cannot be read on this site yet">
        <p>It asks for a consent that this site cannot take yet.</p>
      </Notice>
    );
  }

  // One enrolment per reader, tenant and workbook. Create on first open.
  const supabase = reader.supabase;
  const { data: existing, error: readError } = await supabase
    .from("enrolments")
    .select("id, version_id")
    .eq("user_id", reader.userId)
    .eq("tenant_id", reader.tenantId)
    .eq("workbook_id", card.workbookId)
    .maybeSingle();
  let enrolment = existing as { id: string; version_id: string } | null;
  if (readError) {
    console.error("tenant_read_enrolment_failed", readError.code ?? "");
    return (
      <Notice site={site} title="This workbook is not available right now">
        <p>Please try again in a few minutes.</p>
      </Notice>
    );
  }
  if (enrolment) {
    await supabase.from("enrolments").update({ last_opened_at: new Date().toISOString() }).eq("id", enrolment.id);
  } else if (gates.readOnly) {
    return (
      <Notice site={site} title="A new workbook cannot be started right now">
        <p>
          Your account cannot be added to on this site at the moment. You can manage your account on the <a href={`${siteOrigin()}/you`}>{brand.name} site</a>.
        </p>
      </Notice>
    );
  } else {
    const { data: created, error } = await supabase
      .from("enrolments")
      .insert({ user_id: reader.userId, tenant_id: reader.tenantId, workbook_id: card.workbookId, version_id: facts.current_version_id })
      .select("id, version_id")
      .single();
    if (error || !created) {
      console.error("tenant_read_enrol_failed", error?.code ?? "");
      notFound();
    }
    enrolment = created as { id: string; version_id: string };
  }

  // Sections for the pinned version, as the database opens them to this reader on this tenant.
  const { data: sectionRows } = await supabase.from("workbook_sections").select("kind, unit_number, body, free").eq("version_id", enrolment.version_id);
  const rebuilt = rebuildWorkbook((sectionRows ?? []) as SectionRow[]);
  if (!rebuilt) notFound();

  // Progress events for this enrolment: ids and timestamps only (F-020).
  const { data: eventRows } = await supabase.from("progress_events").select("kind, ref, at").eq("enrolment_id", enrolment.id).order("at", { ascending: true }).limit(5000);
  const events = ((eventRows ?? []) as { kind: string; ref: string | null; at: string }[]).map((e) => ({ kind: e.kind, ref: e.ref, at: e.at }));

  return (
    <TenantShell site={site} reader>
      <p className="tenant-crumbs">
        <Link href="/">{site.name}</Link> <span aria-hidden="true">/</span> <Link href={`/w/${card.slug}`}>{card.title}</Link>
      </p>
      {gates.readOnly ? <p role="note">You can read your work on this site, not add to it, at the moment. You can manage your account on the {brand.name} site.</p> : null}
      <TenantReadClient
        workbook={withTitleCopy(rebuilt.workbook, titleCopyFor(card.code))}
        enrolmentId={enrolment.id}
        lockedUnits={rebuilt.lockedUnits}
        lockedLine={`This part is not open on this site. ${tenantPriceLine(card)}`}
        events={events}
        readOnly={gates.readOnly}
      />
    </TenantShell>
  );
}
