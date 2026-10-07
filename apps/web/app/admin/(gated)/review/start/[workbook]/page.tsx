import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JsonEditor } from "@/components/admin/JsonEditor";
import { adminAbilities } from "@/lib/admin/permissions";
import { isUuid, prettyJson, schemaHints, starterDocument } from "@/lib/author-release";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../../_components/Bits";
import { checkWorkbookJson, saveWorkbookVersion } from "../../editor-actions";

export const metadata: Metadata = { title: "First version", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The first version of a submitted workbook (F-086), written in the JSON
 * editor from a starting document with the workbook's identity filled in.
 * Saving moves a draft workbook into the review queue.
 */
export default async function StartVersionPage({ params }: { params: Promise<{ workbook: string }> }) {
  const { workbook } = await params;
  const staff = await getStaffSession(`/admin/review/start/${workbook}`);
  if (!isUuid(workbook) || !adminAbilities(staff.roles).releaseVersions) notFound();
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("workbooks")
    .select("id, code, slug, title, card_line, genre_id, safety_tier, depth, badge, is_demo")
    .eq("id", workbook)
    .maybeSingle();
  const w = data as Parameters<typeof starterDocument>[0] & { id: string } | null;
  if (!w) notFound();
  const { data: existing } = await supabase.from("workbook_versions").select("id").eq("workbook_id", w.id).order("created_at", { ascending: false }).limit(1);
  const latest = (existing ?? [])[0] as { id: string } | undefined;
  if (latest) redirect(`/admin/review/${latest.id}/edit`);

  return (
    <div className="admin-page">
      <AdminBack href="/admin/review" label="Review queue" />
      <h1>
        First version of <code>{w.code}</code> {w.title}
      </h1>
      <p className="muted">The identity is filled in from the workbook record. Write the content until the validator passes, then save.</p>
      <JsonEditor
        workbookId={w.id}
        baseVersionId={null}
        baseHash={null}
        code={w.code}
        initialText={prettyJson(starterDocument(w))}
        hints={schemaHints()}
        check={checkWorkbookJson}
        save={saveWorkbookVersion}
      />
    </div>
  );
}
