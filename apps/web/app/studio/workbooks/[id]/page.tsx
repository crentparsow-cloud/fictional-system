import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReleaseNoticeLine } from "@/components/studio/ReleaseBits";
import { versionUnderReview, type QueueVersion } from "@/lib/admin/review";
import {
  PRICE_CHOICE_LABELS,
  SHARE_ESTIMATE_INPUTS,
  STUDIO_SIGNOFF_LABELS,
  authorRequirementLabel,
  authorStatus,
  isUuid,
  ladderOptions,
  shareEstimate,
  shortHash,
  studioSignoffKinds,
} from "@/lib/author-release";
import { pricePointFromRow, type PricePoint } from "@/lib/pricing";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { choosePrice, signOffVersion } from "../actions";

export const metadata: Metadata = { title: "Workbook", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const BADGE_LABELS: Record<string, string> = {
  official: "Official",
  made_with_author: "Made with the author",
  public_domain: "Public domain",
  demo: "Demo",
};

interface WorkbookRow {
  id: string;
  org_id: string;
  code: string;
  title: string;
  short_title: string | null;
  card_line: string;
  badge: string;
  status: string;
  is_demo: boolean;
  current_version_id: string | null;
  price_point_id: string | null;
  in_membership: boolean;
}

interface SignoffRow {
  id: string;
  kind: string;
  signer_name: string;
  content_hash: string;
  recorded_at: string;
}

/**
 * One workbook in the Studio (F-038, F-039, F-040): where it stands, the
 * reviewer's notes sent back to you, a preview of the version under review
 * in the real reader, the sign-off against that version's exact content
 * hash, and the price from the ladder. Everything is read through the
 * signed-in person's client, so row level security decides.
 */
export default async function StudioWorkbookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const base = await requireStudio(`/studio/workbooks/${id}`, sp.org);
  const supabase = await createUserClient();
  const { data: wbData } = await supabase
    .from("workbooks")
    .select("id, org_id, code, title, short_title, card_line, badge, status, is_demo, current_version_id, price_point_id, in_membership")
    .eq("id", id)
    .maybeSingle();
  if (!wbData) notFound();
  const w = wbData as WorkbookRow;
  const org = base.orgs.find((o) => o.id === w.org_id);
  if (!org) notFound();
  const ctx = { ...base, org };
  const q = (p: string) => withOrg(p, ctx.org.id, ctx.multi);
  const date = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(s));

  const [versionsRes, submissionRes, choiceRes, pointsRes, profileRes, allowsRes] = await Promise.all([
    supabase
      .from("workbook_versions")
      .select("id, workbook_id, semver, content_hash, created_at, published_at, validated_at")
      .eq("workbook_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("workbook_submissions").select("status, status_reason, submitted_at").eq("workbook_id", id).maybeSingle(),
    supabase.from("workbook_price_choices").select("price_point_id, in_membership, status, review_reason, chosen_at").eq("workbook_id", id).maybeSingle(),
    supabase.from("price_points").select("id, kind, amounts, stripe_price_id, active").eq("kind", "workbook"),
    supabase.from("profiles").select("display_name").eq("user_id", ctx.userId).maybeSingle(),
    supabase.rpc("licence_allows_membership", { p_workbook: id }),
  ]);
  const versions = (versionsRes.data ?? []) as QueueVersion[];
  const version = versionUnderReview(w, versions);

  const [reqRes, signRes, notesRes] = version
    ? await Promise.all([
        supabase.rpc("studio_release_status", { p_version: version.id }),
        supabase.from("release_signoffs").select("id, kind, signer_name, content_hash, recorded_at").eq("version_id", version.id).order("recorded_at"),
        supabase
          .from("review_notes")
          .select("id, body, created_at, version_id")
          .in(
            "version_id",
            versions.map((v) => v.id),
          )
          .eq("kind", "send_back")
          .order("created_at", { ascending: false })
          .limit(20),
      ])
    : [null, null, null];
  if (reqRes?.error) console.error("studio_release_status_failed", reqRes.error.code ?? "");

  const requirements = ((reqRes?.data ?? []) as { requirement: string; required: boolean; met: boolean }[]).filter((r) => r.required);
  const signoffs = ((signRes?.data ?? []) as SignoffRow[]).filter((s) => version && s.content_hash === version.content_hash);
  const notes = (notesRes?.data ?? []) as { id: string; body: string; created_at: string }[];
  const submission = submissionRes.data as { status: string; status_reason: string | null; submitted_at: string } | null;
  const choice = choiceRes.data as { price_point_id: string; in_membership: boolean; status: string; review_reason: string | null; chosen_at: string } | null;
  const points = ((pointsRes.data ?? []) as Parameters<typeof pricePointFromRow>[0][]).map(pricePointFromRow).filter((p): p is PricePoint => p !== null);
  const options = ladderOptions(points);
  const allowsMembership = allowsRes.data === true;
  const kinds = studioSignoffKinds(ctx.org.role, ctx.org.kind);
  const canPrice = roleCan(ctx.org.role).writeWorkbooks && w.status !== "retired";
  const status = authorStatus(w.status);
  const signable = Boolean(version && !version.published_at && w.status !== "retired" && kinds.length);
  const myName = ((profileRes.data as { display_name?: string | null } | null)?.display_name ?? "").trim();
  const estimateReady = Object.values(SHARE_ESTIMATE_INPUTS).every((v) => v !== null);
  const pointLabel = (pid: string | null) => options.find((o) => o.id === pid)?.label ?? pid ?? "";

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={q("/studio/workbooks")}>All workbooks</Link>
      </p>
      <h1>
        {w.title} <code>{w.code}</code>
      </h1>
      <p>
        <strong>{status.label}.</strong> <span className="muted">{status.line}</span>
      </p>
      <ReleaseNoticeLine code={sp.notice} />

      {submission ? (
        <p className="muted">
          Submitted {date(submission.submitted_at)}. Submission status: {submission.status.replace(/_/g, " ")}.
          {submission.status_reason ? <span className="admin-note"> {submission.status_reason}</span> : null}
        </p>
      ) : null}

      {notes.length ? (
        <section className="card admin-create" aria-labelledby="notes-h">
          <h2 id="notes-h">Notes from review</h2>
          <ul className="studio-plain">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="muted small">{date(n.created_at)}.</span> <span className="admin-message">{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card admin-create" aria-labelledby="prev-h">
        <h2 id="prev-h">Preview</h2>
        {version ? (
          <>
            <p>
              Version {version.semver}, content <code>{shortHash(version.content_hash)}</code>, made {date(version.created_at)}.
              {version.published_at ? " This version is published." : ""}
            </p>
            <p>
              <Link className="btn" href={q(`/studio/workbooks/${w.id}/preview?v=${version.id}`)}>
                Preview in the reader
              </Link>
            </p>
            <p className="muted small">The real reader, on a phone or a desktop, in both themes and at 200% text. Nothing you type is saved.</p>
          </>
        ) : (
          <p className="muted">There is no version to preview yet. Akana builds the first version from your submission.</p>
        )}
      </section>

      <section className="card admin-create" aria-labelledby="sign-h">
        <h2 id="sign-h">Sign-off</h2>
        {!version ? (
          <p className="muted">Sign-off opens once there is a version to look at.</p>
        ) : (
          <>
            {requirements.length ? (
              <>
                <p>Before this version can go live, it needs:</p>
                <ul className="review-reqs">
                  {requirements.map((r) => (
                    <li key={r.requirement} className={r.met ? "is-met" : "is-unmet"}>
                      <span className="review-req-mark" aria-hidden="true">
                        {r.met ? "Done" : "Waiting"}
                      </span>
                      <span>
                        {authorRequirementLabel(r.requirement)}
                        <span className="admin-vh">{r.met ? ": done" : ": waiting"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {signoffs.length ? (
              <ul className="studio-plain">
                {signoffs.map((s) => (
                  <li key={s.id}>
                    Signed off as {s.kind} by {s.signer_name}, {date(s.recorded_at)}.
                  </li>
                ))}
              </ul>
            ) : null}
            {signable ? (
              <form action={signOffVersion} className="admin-form studio-wide">
                <input type="hidden" name="workbook" value={w.id} />
                <input type="hidden" name="version" value={version.id} />
                <input type="hidden" name="content_hash" value={version.content_hash} />
                {ctx.multi ? <input type="hidden" name="org" value={ctx.org.id} /> : null}
                <p>
                  You are signing off version {version.semver}, content <code>{shortHash(version.content_hash)}</code>. If Akana changes anything after
                  this, you will be asked to sign the new version.
                </p>
                <dl className="studio-facts">
                  <dt>Title</dt>
                  <dd>{w.title}</dd>
                  <dt>Short title</dt>
                  <dd>{w.short_title || <span className="muted">None, the full title is used</span>}</dd>
                  <dt>Card line</dt>
                  <dd>{w.card_line || <span className="muted">Not written yet</span>}</dd>
                  <dt>Badge</dt>
                  <dd>{BADGE_LABELS[w.badge] ?? w.badge}</dd>
                </dl>
                <p className="muted small">
                  Safety lines and Help now are set by Akana for every reader and cannot be changed by authors.{" "}
                  <Link href="/studio/help/house-rules">Why</Link>.
                </p>
                {kinds.length > 1 ? (
                  <fieldset className="studio-radios">
                    <legend>Sign as</legend>
                    {kinds.map((k, i) => (
                      <label key={k} className="check">
                        <input type="radio" name="kind" value={k} defaultChecked={i === 0} /> {STUDIO_SIGNOFF_LABELS[k]}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <input type="hidden" name="kind" value={kinds[0]} />
                )}
                <label htmlFor="so-name">Your name, as it goes on the record</label>
                <input id="so-name" name="signer_name" type="text" maxLength={200} required defaultValue={myName} autoComplete="name" />
                <label htmlFor="so-note">Note for the Akana team (optional)</label>
                <input id="so-note" name="note" type="text" maxLength={500} />
                <label className="check">
                  <input type="checkbox" name="confirm" value="yes" required /> I have previewed this version and I approve its content, title, short title,
                  card line and badge.
                </label>
                <div className="admin-actions">
                  <button type="submit" className="btn">
                    Sign off this version
                  </button>
                </div>
              </form>
            ) : kinds.length === 0 ? (
              <p className="muted">Owners, editors and authors in your organisation sign off.</p>
            ) : null}
          </>
        )}
      </section>

      <section className="card admin-create" aria-labelledby="price-h">
        <h2 id="price-h">Price</h2>
        {w.is_demo ? (
          <p className="muted">Demo workbooks are never sold, so they have no price.</p>
        ) : (
          <>
            <p className="muted">
              Choose a point on Akana&apos;s price ladder. Akana approves it with the workbook and sets the prices in each currency.{" "}
              <Link href="/studio/help/pricing">How pricing works</Link>.
            </p>
            {w.price_point_id ? (
              <p>
                Current price: <strong>{pointLabel(w.price_point_id)}</strong>
                {w.in_membership ? ", in the membership" : ", not in the membership"}.
              </p>
            ) : null}
            {choice ? (
              <p>
                Your choice: {pointLabel(choice.price_point_id)}
                {choice.in_membership ? ", in the membership" : ""}. <strong>{PRICE_CHOICE_LABELS[choice.status] ?? choice.status}</strong>.
                {choice.status === "declined" && choice.review_reason ? <span className="admin-note"> {choice.review_reason}</span> : null}
              </p>
            ) : null}
            {canPrice ? (
            <form action={choosePrice} className="admin-form studio-wide">
              <input type="hidden" name="workbook" value={w.id} />
              {ctx.multi ? <input type="hidden" name="org" value={ctx.org.id} /> : null}
              <fieldset className="studio-radios">
                <legend>Ladder point</legend>
                {options.map((o) => (
                  <label key={o.id} className="check">
                    <input type="radio" name="price_point" value={o.id} required defaultChecked={(choice?.price_point_id ?? w.price_point_id) === o.id} /> {o.label}:{" "}
                    {o.gbp ?? "price to be confirmed"}
                  </label>
                ))}
              </fieldset>
              {allowsMembership ? (
                <label className="check">
                  <input type="checkbox" name="in_membership" value="yes" defaultChecked={choice?.in_membership ?? w.in_membership} /> Include it in the Akana
                  membership
                </label>
              ) : (
                <p className="muted small">Your licence for this book does not include the membership, so it is sold on its own.</p>
              )}
              <p className="muted small">
                {estimateReady
                  ? "Your share is shown next to each point, net of VAT and payment fees."
                  : "Your share per sale, net of VAT and payment fees, shows here once Akana has set the ladder figures and the share. They are not set yet."}
              </p>
              {estimateReady
                ? options.map((o) => {
                    const p = points.find((x) => x.id === o.id);
                    const est = shareEstimate(p?.amounts.GBP);
                    return est === null ? null : (
                      <p key={o.id} className="small">
                        {o.label}: about {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(est / 100)} a sale.
                      </p>
                    );
                  })
                : null}
              <div className="admin-actions">
                <button type="submit" className="btn secondary">
                  Send price choice
                </button>
              </div>
            </form>
            ) : (
              <p className="muted">Owners, editors and authors in your organisation choose the price.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
