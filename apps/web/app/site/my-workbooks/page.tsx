import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TenantShell } from "@/components/tenant/TenantShell";
import { tenantReaderPage } from "@/lib/tenant-page";
import { getTenantReader, loadTenantGates, nextTenantGate, tenantGateHref } from "@/lib/tenant-reader";
import { listTenantCatalogue, type TenantCard } from "@/lib/tenant-site";

/**
 * The reader's workbooks on this tenant site, and only this one (F-133).
 * The enrolments are read with the reader's tenant-scoped session, so the
 * database returns rows of this tenant alone (migration 0073); the tenant in
 * the query is the proxy's, never the browser's. Titles come from this
 * tenant's visible catalogue: a workbook it has stopped listing is not shown.
 * No streaks, no counts of days.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your workbooks", robots: { index: false, follow: false } };

export default async function TenantMyWorkbooksPage() {
  const page = await tenantReaderPage();
  if (page.unavailable) return page.unavailable;
  const { site } = page;
  const reader = await getTenantReader();
  if (!reader) redirect(`/sign-in?next=${encodeURIComponent("/my-workbooks")}`);
  const gates = await loadTenantGates(reader.supabase);
  if (gates && nextTenantGate(gates)) redirect(tenantGateHref("/my-workbooks"));

  let failed = false;
  let mine: { card: TenantCard; finished: boolean }[] = [];
  try {
    const [cards, { data, error }] = await Promise.all([
      listTenantCatalogue(site.id),
      reader.supabase
        .from("enrolments")
        .select("workbook_id, status, last_opened_at")
        .eq("user_id", reader.userId)
        .eq("tenant_id", reader.tenantId)
        .order("last_opened_at", { ascending: false })
        .limit(200),
    ]);
    if (error) throw new Error(error.code ?? "enrolments");
    const byId = new Map(cards.map((c) => [c.workbookId, c]));
    mine = ((data ?? []) as { workbook_id: string; status: string }[]).flatMap((e) => {
      const card = byId.get(e.workbook_id);
      return card ? [{ card, finished: e.status === "finished" }] : [];
    });
  } catch (err) {
    console.error("tenant_my_workbooks_failed", err instanceof Error ? err.message : "unknown");
    failed = true;
  }

  return (
    <TenantShell site={site} reader>
      <section className="tenant-section">
        <h1>Your workbooks</h1>
        <p className="muted">The workbooks you have started on {site.name}.</p>
        {failed ? <p role="alert">Your workbooks could not be loaded just now. Please try again in a few minutes.</p> : null}
        {!failed && mine.length === 0 ? (
          <div className="empty-state">
            <h2>Nothing started yet</h2>
            <p>Pick a workbook and begin when you are ready.</p>
            <Link className="btn" href="/">
              See the workbooks
            </Link>
          </div>
        ) : null}
        {mine.length ? (
          <ul className="tenant-shelf">
            {mine.map(({ card, finished }) => (
              <li key={card.workbookId}>
                <span>
                  <strong>{card.title}</strong>
                  {finished ? <span className="muted"> (finished)</span> : null}
                </span>
                <a className="btn" href={`/read/${card.slug}`}>
                  {finished ? "Open" : "Continue"}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </TenantShell>
  );
}
