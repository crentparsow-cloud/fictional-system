import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import "@akana/engine/engine.css";
import { TryWall } from "@/components/auth/TryWall";
import { getReaderSession } from "@/lib/auth";
import { countView } from "@/lib/funnel-server";
import { rebuildWorkbook, type SectionRow } from "@/lib/rebuild-workbook";
import { createUserClient } from "@/lib/supabase/server";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { brand } from "@/lib/brand";
import { TryClient } from "./TryClient";

/**
 * Try the first unit with no account (5.2). Public, outside the reader group,
 * so no sign-in sits in front of it. Reads the free sections through the
 * visitor's own client, so RLS decides what is shown: the listing, the start
 * and the free units of a public title, nothing else.
 *
 * Answers are written to the visitor's device only (DeviceAnswerStore). The
 * soft sign-in wall stands in place of the first unit that is not free. Its
 * Google sign-in component needs the wider script policy, so "/try/:slug" is
 * in ONE_TAP_PATHS (apps/web/csp.mjs). Nothing here is indexed.
 *
 * Signed-in readers go straight to /read. A wellbeing title (safety tier
 * standard or higher) goes to sign-in first, because consent to store health
 * information needs an account.
 */
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createUserClient();
  const { data } = await supabase.from("workbooks").select("short_title, title").eq("slug", slug).maybeSingle();
  return { title: (data?.short_title as string | null) ?? (data?.title as string | null) ?? "Try a workbook", robots: { index: false, follow: false } };
}

interface Row {
  id: string;
  tenant_id: string;
  safety_tier: "none" | "standard" | "higher";
  current_version_id: string | null;
}

export default async function TryPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  if (await getReaderSession()) redirect(`/read/${slug}`);
  const tenantId = await tenantIdForRequest();
  if (!tenantId) notFound();

  const supabase = await createUserClient();
  const { data } = await supabase.from("workbooks").select("id, tenant_id, safety_tier, current_version_id").eq("slug", slug).maybeSingle();
  const wb = data as Row | null;
  if (!wb || !wb.current_version_id || wb.tenant_id !== tenantId) notFound();
  if (wb.safety_tier !== "none") redirect(`/sign-in?next=${encodeURIComponent(`/read/${slug}`)}`);

  const { data: sectionRows } = await supabase.from("workbook_sections").select("kind, unit_number, body, free").eq("version_id", wb.current_version_id);
  const rebuilt = rebuildWorkbook((sectionRows ?? []) as SectionRow[]);
  if (!rebuilt) notFound();
  // Nothing free to try: send them to the page that explains the title.
  if (!rebuilt.workbook.units.some((u) => !rebuilt.lockedUnits.includes(u.number))) redirect(`/w/${slug}`);

  await countView("sample_view", wb.id, null); // F-141, ids only, opt-out respected

  return (
    <main className="wrap try-page">
      <p className="eyebrow">
        <Link href={`/w/${slug}`}>{brand.name}</Link>
      </p>
      <TryClient workbook={rebuilt.workbook} slug={slug} lockedUnits={rebuilt.lockedUnits} missing={rebuilt.missing} wall={<TryWall slug={slug} />} />
    </main>
  );
}
