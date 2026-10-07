import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@akana/engine/engine.css";
import { PreviewPlayer } from "@/components/preview/PreviewPlayer";
import { isUuid, previewDoc, shortHash } from "@/lib/author-release";
import { adminAbilities } from "@/lib/admin/permissions";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../../_components/Bits";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Staff preview of one version in the real reader engine (F-038). Same
 * component as the Studio preview: memory-only answers, nothing saved,
 * nothing sold, the internal block stripped before it reaches the browser.
 */
export default async function AdminPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaffSession(`/admin/review/${id}/preview`);
  if (!isUuid(id) || !adminAbilities(staff.roles).readReviewQueue) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase.from("workbook_versions").select("id, semver, content, content_hash").eq("id", id).maybeSingle();
  const row = data as { id: string; semver: string; content: unknown; content_hash: string } | null;
  if (!row) notFound();
  const doc = previewDoc(row.content);
  return (
    <div className="admin-page">
      <AdminBack href={`/admin/review/${id}`} label="Back to the review" />
      {doc.ok ? (
        <PreviewPlayer workbook={doc.workbook} label={`Version ${row.semver}, content ${shortHash(row.content_hash)}.`} />
      ) : (
        <div className="card admin-empty">
          <h1>This version does not fit the schema</h1>
          <p className="muted">The reader cannot open it. Fix it in the JSON editor; the validator on the review page lists what is wrong.</p>
        </div>
      )}
    </div>
  );
}
