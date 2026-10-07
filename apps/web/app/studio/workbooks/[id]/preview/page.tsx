import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@akana/engine/engine.css";
import { PreviewPlayer } from "@/components/preview/PreviewPlayer";
import { isUuid, previewDoc, shortHash } from "@/lib/author-release";
import { withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Preview in the real reader engine for the organisation (F-038). The
 * version is read through the member's own client: workbook_versions is
 * readable by the owning organisation and staff only (0002). The internal
 * block is stripped before anything reaches the browser, as publishing
 * does. Nothing is written: no enrolment, no answers, no progress.
 */
export default async function StudioPreviewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  const v = Array.isArray(sp.v) ? sp.v[0] : sp.v;
  if (!isUuid(id) || !isUuid(v)) notFound();
  const base = await requireStudio(`/studio/workbooks/${id}`, sp.org);
  const supabase = await createUserClient();
  const { data } = await supabase.from("workbook_versions").select("id, workbook_id, semver, content, content_hash").eq("id", v).maybeSingle();
  const row = data as { id: string; workbook_id: string; semver: string; content: unknown; content_hash: string } | null;
  if (!row || row.workbook_id !== id) notFound();
  const { data: wb } = await supabase.from("workbooks").select("org_id, title").eq("id", id).maybeSingle();
  const org = wb ? base.orgs.find((o) => o.id === (wb as { org_id: string }).org_id) : undefined;
  if (!org) notFound();
  const back = withOrg(`/studio/workbooks/${id}`, org.id, base.multi);
  const doc = previewDoc(row.content);

  return (
    <div className="studio-page">
      <p className="admin-back">
        <Link href={back}>Back to the workbook</Link>
      </p>
      {doc.ok ? (
        <PreviewPlayer workbook={doc.workbook} label={`Version ${row.semver}, content ${shortHash(row.content_hash)}.`} />
      ) : (
        <div className="card admin-empty">
          <h1>This version cannot be previewed yet</h1>
          <p className="muted">It does not fit the workbook format, so the reader cannot open it. Akana is working on it and will let you know.</p>
        </div>
      )}
    </div>
  );
}
