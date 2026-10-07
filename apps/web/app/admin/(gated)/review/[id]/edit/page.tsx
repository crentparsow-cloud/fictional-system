import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonEditor } from "@/components/admin/JsonEditor";
import { adminAbilities } from "@/lib/admin/permissions";
import { isUuid, prettyJson, schemaHints, shortHash } from "@/lib/author-release";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../../_components/Bits";
import { checkWorkbookJson, saveWorkbookVersion } from "../../editor-actions";

export const metadata: Metadata = { title: "Edit JSON", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Staff JSON editor (F-086), starting from one version. Saving makes a new
 * version; this one never changes. Owners and editors only. Reader answers
 * are never read here.
 */
export default async function EditVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaffSession(`/admin/review/${id}/edit`);
  if (!isUuid(id)) notFound();
  const can = adminAbilities(staff.roles);
  if (!can.readReviewQueue) notFound();
  if (!can.releaseVersions) {
    return (
      <div className="admin-page">
        <AdminBack href={`/admin/review/${id}`} label="Back to the review" />
        <h1>Edit JSON</h1>
        <p className="admin-note">Owners and editors edit workbook JSON.</p>
      </div>
    );
  }
  const supabase = await createUserClient();
  const { data } = await supabase.from("workbook_versions").select("id, workbook_id, semver, content, content_hash").eq("id", id).maybeSingle();
  const v = data as { id: string; workbook_id: string; semver: string; content: unknown; content_hash: string } | null;
  if (!v) notFound();
  const { data: wb } = await supabase.from("workbooks").select("id, code, title").eq("id", v.workbook_id).maybeSingle();
  const w = wb as { id: string; code: string; title: string } | null;
  if (!w) notFound();

  return (
    <div className="admin-page">
      <AdminBack href={`/admin/review/${id}`} label="Back to the review" />
      <h1>
        Edit <code>{w.code}</code> {w.title}
      </h1>
      <p className="muted">
        Starting from version {v.semver}, content <code>{shortHash(v.content_hash)}</code>. The validator runs on the server as you type.
      </p>
      <JsonEditor
        workbookId={w.id}
        baseVersionId={v.id}
        baseHash={v.content_hash}
        code={w.code}
        initialText={prettyJson(v.content)}
        hints={schemaHints()}
        check={checkWorkbookJson}
        save={saveWorkbookVersion}
      />
    </div>
  );
}
