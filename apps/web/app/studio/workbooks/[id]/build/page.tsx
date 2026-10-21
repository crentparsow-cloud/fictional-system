import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkbookBuilder } from "@/components/studio/WorkbookBuilder";
import { isUuid, shortHash } from "@/lib/author-release";
import { modelFromContent } from "@/lib/studio-builder";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Build", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function semverKey(s: string): number[] {
  return s.split(".").map((n) => Number(n) || 0);
}
function newest<T extends { semver: string }>(rows: readonly T[]): T | null {
  return (
    [...rows].sort((a, b) => {
      const x = semverKey(a.semver);
      const y = semverKey(b.semver);
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0);
      return 0;
    })[0] ?? null
  );
}

/**
 * The workbook builder (build list 8.2). A form for the units, key ideas and
 * exercises of a workbook that already has a version. It starts from the
 * newest version and saves a new, unpublished one. Nothing is published here:
 * the draft goes through preview, sign-off and release like any other.
 */
export default async function BuildPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const ctx = await requireStudio(`/studio/workbooks/${id}/build`, sp.org);
  const supabase = await createUserClient();
  const q = (p: string) => withOrg(p, ctx.org.id, ctx.multi);

  const { data: wb } = await supabase.from("workbooks").select("id, org_id, code, title, status").eq("id", id).maybeSingle();
  const w = wb as { id: string; org_id: string; code: string; title: string; status: string } | null;
  if (!w || w.org_id !== ctx.org.id) notFound();

  const { data: list } = await supabase.from("workbook_versions").select("id, semver").eq("workbook_id", id).limit(200);
  const latest = newest((list ?? []) as { id: string; semver: string }[]);
  const { data: full } = latest ? await supabase.from("workbook_versions").select("id, semver, content, content_hash, published_at").eq("id", latest.id).maybeSingle() : { data: null };
  const version = full as { id: string; semver: string; content: Record<string, unknown>; content_hash: string; published_at: string | null } | null;

  const can = roleCan(ctx.org.role).writeWorkbooks && w.status !== "retired";
  const kind = typeof (version?.content.structure as { unit?: unknown } | undefined)?.unit === "string" ? String((version?.content.structure as { unit: string }).unit) : "week";

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={q(`/studio/workbooks/${w.id}`)}>Back to {w.title}</Link>
      </p>
      <h1>
        Build <code>{w.code}</code>
      </h1>
      {!version ? (
        <div className="card admin-empty">
          <h2>No version to start from yet</h2>
          <p className="muted">
            Akana builds the first version from your submission. Once it exists you can edit it here. In the meantime, the{" "}
            <Link href={q("/studio/outline")}>outline generator</Link> helps you plan the units.
          </p>
        </div>
      ) : !can ? (
        <p className="muted">Owners, editors and authors in your organisation build workbooks. You can read this page, not change it.</p>
      ) : (
        <>
          <p className="muted">
            Starting from version {version.semver}, content <code>{shortHash(version.content_hash)}</code>. Saving makes a new draft version. Nothing goes live until
            you sign it off and Akana releases it. Safety lines, the badge and the internal notes are Akana&apos;s and are not shown. See{" "}
            <Link href="/how-to-write">how to write for Akana</Link>.
          </p>
          <WorkbookBuilder
            workbookId={w.id}
            baseVersionId={version.id}
            orgId={ctx.multi ? ctx.org.id : null}
            unitKind={kind}
            initial={modelFromContent(version.content)}
            published={Boolean(version.published_at)}
          />
        </>
      )}
    </div>
  );
}
