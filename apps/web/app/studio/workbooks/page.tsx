import type { Metadata } from "next";
import Link from "next/link";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { authorStatus } from "@/lib/author-release";
import { withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Workbooks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface Row {
  id: string;
  code: string;
  title: string;
  status: string;
  is_demo: boolean;
  updated_at: string;
}

/**
 * The organisation's workbooks, each with where it stands. Opening one
 * leads to its preview, sign-off and price (F-038 to F-040).
 */
export default async function StudioWorkbooksPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/workbooks", sp.org);
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workbooks")
    .select("id, code, title, status, is_demo, updated_at")
    .eq("org_id", ctx.org.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) console.error("studio_workbooks_failed", error.code ?? "");
  const rows = (data ?? []) as Row[];

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/workbooks" />
      <h1>Workbooks</h1>
      <p className="muted">
        Preview each workbook as readers will see it, sign off the version that goes live and choose its price.{" "}
        <Link href="/studio/help/review">How review works</Link>.
      </p>
      {rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>No workbooks yet</h2>
          <p className="muted">
            A workbook starts when you submit one for a book. <Link href={withOrg("/studio/books", ctx.org.id, ctx.multi)}>Go to your books</Link>.
          </p>
        </div>
      ) : (
        <ul className="studio-list">
          {rows.map((w) => {
            const s = authorStatus(w.status);
            return (
              <li key={w.id} className="card">
                <h2>
                  <Link href={withOrg(`/studio/workbooks/${w.id}`, ctx.org.id, ctx.multi)}>{w.title}</Link> <code>{w.code}</code>
                  {w.is_demo ? (
                    <>
                      {" "}
                      <span className="badge demo">Demo</span>
                    </>
                  ) : null}
                </h2>
                <p>
                  <strong>{s.label}.</strong> <span className="muted">{s.line}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
