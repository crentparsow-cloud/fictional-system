import type { Metadata } from "next";
import { CopyLink } from "@/components/you/CopyLink";
import { OrgSwitcher } from "@/components/studio/StudioBits";
import { MAX_RECOMMENDATIONS, recommendBackCandidates, shareConfigFrom, shareSentence, type RecommendationRow } from "@/lib/author-growth";
import { money } from "@/lib/dashboards";
import { parseOrgRole } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { siteOrigin } from "@/lib/site-url";
import { createUserClient } from "@/lib/supabase/server";
import { recommendAuthor, unrecommendAuthor } from "./actions";

export const metadata: Metadata = { title: "Growth", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  "rec-saved": "Saved. Your recommendations are updated.",
  "rec-removed": "Removed.",
  "rec-full": `You can recommend up to ${MAX_RECOMMENDATIONS} authors. Remove one first.`,
  "rec-already": "You already recommend that author.",
  "rec-failed": "That could not be saved. The author needs a public workbook, and you need to be an owner or editor.",
};

/**
 * Growth (14.12, 14.13, 6.4): your affiliate link and what it has earned, and
 * the authors you recommend, with the ones who recommend you shown back.
 * Counts and money only: never a reader's name. Money figures come from the
 * ledger the Payments page reads.
 */
export default async function StudioGrowthPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/growth", sp.org);
  const supabase = await createUserClient();
  const role = parseOrgRole(ctx.org.role);
  const canWrite = role === "owner" || role === "editor";
  const noticeKey = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  const [linkRes, summaryRes, cfgRes, recsRes, authorsRes] = await Promise.all([
    canWrite ? supabase.rpc("my_author_link", { p_org: ctx.org.id }) : Promise.resolve({ data: null }),
    supabase.rpc("author_referral_summary", { p_org: ctx.org.id }),
    supabase.from("app_config").select("value").eq("key", "author_share").maybeSingle(),
    canWrite ? supabase.rpc("my_author_recommendations", { p_org: ctx.org.id }) : Promise.resolve({ data: [] }),
    canWrite
      ? supabase.from("authors").select("org_id, slug, display_name").eq("status", "active").not("org_id", "is", null).order("display_name").limit(300)
      : Promise.resolve({ data: [] }),
  ]);
  const code = typeof linkRes.data === "string" ? linkRes.data : null;
  const summary = ((summaryRes.data ?? []) as { referred: number; paying: number; earned_minor: number | string; currency: string }[])[0];
  const share = shareConfigFrom((cfgRes.data as { value?: unknown } | null)?.value);
  const rows: RecommendationRow[] = ((recsRes.data ?? []) as { direction: "recommends" | "recommended_by"; org_id: string; display_name: string; slug: string }[]).map((r) => ({
    direction: r.direction,
    orgId: r.org_id,
    name: r.display_name,
    slug: r.slug,
  }));
  const mine = rows.filter((r) => r.direction === "recommends");
  const back = recommendBackCandidates(rows);
  const taken = new Set(mine.map((r) => r.orgId));
  const options = ((authorsRes.data ?? []) as { org_id: string; slug: string; display_name: string }[]).filter(
    (a) => a.org_id !== ctx.org.id && !taken.has(a.org_id),
  );
  const origin = siteOrigin();

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/growth" />
      <h1>Growth</h1>
      {notice ? <p role="status">{notice}</p> : null}

      <section aria-labelledby="g-link">
        <h2 id="g-link">Your link</h2>
        <p>{shareSentence(share.rate, share.months)} Readers who use your link are told this, and it costs them nothing extra.</p>
        {code ? (
          <CopyLink url={`${origin}/a/${code}`} label="Your author link" shareText="Here is my link to Akana." />
        ) : (
          <p className="muted">{canWrite ? "Your link is not available just now. Please try again in a moment." : "Owners and editors can see the link."}</p>
        )}
        {summary ? (
          <p className="small">
            {summary.referred} {summary.referred === 1 ? "reader has" : "readers have"} used your link and {summary.paying} {summary.paying === 1 ? "has" : "have"} paid. Earned so far: {money(Number(summary.earned_minor), summary.currency)}. It appears on your statement as a share of membership revenue.
          </p>
        ) : null}
        <p className="small muted">Sales of a single workbook through your link are paid at your link rate on the Payments page.</p>
      </section>

      <section aria-labelledby="g-recs">
        <h2 id="g-recs">Authors you recommend</h2>
        <p>
          You can recommend up to {MAX_RECOMMENDATIONS} other authors. They appear at the end of your programmes and on your author page. Authors who recommend you appear on your page too.
        </p>
        {!canWrite ? (
          <p className="muted">Owners and editors can change this.</p>
        ) : (
          <>
            {mine.length === 0 ? <p className="muted">You have not recommended anyone yet.</p> : null}
            <ul>
              {mine.map((r) => (
                <li key={r.orgId}>
                  {r.name}{" "}
                  <form action={unrecommendAuthor} style={{ display: "inline" }}>
                    <input type="hidden" name="org" value={ctx.org.id} />
                    <input type="hidden" name="to" value={r.orgId} />
                    <button type="submit" className="btn secondary">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            {mine.length < MAX_RECOMMENDATIONS ? (
              <form action={recommendAuthor} className="card">
                <input type="hidden" name="org" value={ctx.org.id} />
                <p>
                  <label htmlFor="rec-to">Recommend an author</label>
                  <br />
                  <select id="rec-to" name="to" required defaultValue="">
                    <option value="" disabled>
                      Choose an author
                    </option>
                    {options.map((a) => (
                      <option key={a.org_id} value={a.org_id}>
                        {a.display_name}
                      </option>
                    ))}
                  </select>
                </p>
                <button type="submit" className="btn">
                  Recommend
                </button>
              </form>
            ) : null}
            {back.length > 0 ? (
              <>
                <h3>These authors recommend you</h3>
                <ul>
                  {back.map((r) => (
                    <li key={r.orgId}>
                      {r.name}{" "}
                      {mine.length < MAX_RECOMMENDATIONS ? (
                        <form action={recommendAuthor} style={{ display: "inline" }}>
                          <input type="hidden" name="org" value={ctx.org.id} />
                          <input type="hidden" name="to" value={r.orgId} />
                          <button type="submit" className="btn secondary">
                            Recommend them back
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
