import type { Metadata } from "next";
import Link from "next/link";
import { LicenceDraftBanner, OrgSwitcher, StudioNotice } from "@/components/studio/StudioBits";
import { checklist, LICENCE_VERSION, ORG_ROLE_LABELS, parseOrgRole, roleCan, withOrg } from "@/lib/studio";
import { readLicenceTextRow, requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Studio home (F-033): the first-run checklist. Profile, add a book, sign
 * the licence, set up payouts, submit. Counts come through the user client,
 * so the database decides what this person may see.
 */
export default async function StudioHome({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio", sp.org);
  const supabase = await createUserClient();
  const orgId = ctx.org.id;

  const [authors, books, licences, submissions, text] = await Promise.all([
    supabase.rpc("studio_authors", { p_org: orgId }),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("licences").select("status").eq("org_id", orgId),
    supabase.from("workbook_submissions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    readLicenceTextRow(LICENCE_VERSION),
  ]);

  const authorRows = (authors.data ?? []) as { is_me: boolean; bio_status: string; display_name: string }[];
  const mine = authorRows.find((a) => a.is_me) ?? (ctx.org.kind === "individual" ? authorRows[0] : undefined);
  const statuses = ((licences.data ?? []) as { status: string }[]).map((l) => l.status);
  const licence = statuses.includes("active") ? "active" : statuses.includes("pending_verification") ? "pending" : statuses.includes("test_only") ? "test_only" : "none";
  const q = withOrg("", orgId, ctx.multi);
  const items = checklist(
    {
      profileDone: Boolean(mine && mine.bio_status !== "none"),
      bookCount: books.count ?? 0,
      licence,
      connectStatus: ctx.org.connectStatus,
      submissionCount: submissions.count ?? 0,
    },
    q,
  );
  const role = parseOrgRole(ctx.org.role);
  const can = roleCan(role);

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio" />
      <h1>{sp.welcome === "1" ? `Welcome to ${ctx.org.displayName}` : "Your Studio"}</h1>
      <p className="muted">
        {ctx.org.displayName}. Your role: {role ? ORG_ROLE_LABELS[role] : "Member"}.
        {ctx.org.isDemo ? " This is a demo organisation. Nothing here is sold." : ""}
      </p>
      <StudioNotice code={sp.notice} />
      {text?.status === "approved" ? null : <LicenceDraftBanner />}

      <h2>Getting started</h2>
      <ol className="studio-checklist">
        {items.map((it) => (
          <li key={it.key} className={`studio-step is-${it.state}`}>
            <span className="studio-step-mark" aria-hidden="true">
              {it.state === "done" ? "✓" : it.state === "waiting" ? "…" : ""}
            </span>
            <div>
              <h3>
                <Link href={it.href}>{it.title}</Link>
              </h3>
              <p className="muted">
                <span className="admin-vh">{it.state === "done" ? "Done. " : it.state === "waiting" ? "Waiting. " : "To do. "}</span>
                {it.line}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {can.manageMembers ? (
        <p>
          <Link href={withOrg("/console", orgId, ctx.multi)}>Manage your team and authors</Link>
        </p>
      ) : null}
    </div>
  );
}
