import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideEditor } from "@/components/admin/GuideEditor";
import { GuideUnitView, parseGuide } from "@/components/org/GroupBits";
import { adminAbilities } from "@/lib/admin/permissions";
import { isUuid, prettyJson, shortHash } from "@/lib/author-release";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../../_components/Bits";
import { approveGuide, saveGuide, withdrawGuide } from "../actions";

export const metadata: Metadata = { title: "Facilitator guide", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ version: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const STARTER = {
  guide_version: "1",
  intro: "",
  safety: { help_now_reminder: true },
  units: [{ unit_number: 1, minutes: 60, discussion: [{ question: "", minutes: 15 }] }],
};

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  approved: { tone: "ok", text: "Guide approved. Leaders of groups on this version can read it now." },
  withdrawn: { tone: "ok", text: "Guide withdrawn. Leaders no longer see it. You can write a new one." },
  invalid: { tone: "error", text: "Check the form, and that the guide still passes the validator." },
  failed: { tone: "error", text: "That did not save. Try again." },
};

interface GuideRow {
  id: string;
  status: string;
  content: unknown;
  content_hash: string;
  saved_at: string;
  approved_at: string | null;
}

/**
 * One version's facilitator guide (F-212): edit the draft, approve it, or
 * withdraw an approved one. Owners and editors. Approved guides are fixed.
 */
export default async function GuideVersionPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { version } = await params;
  const sp = await searchParams;
  const staff = await getStaffSession(`/admin/guides/${version}`);
  if (!isUuid(version)) notFound();
  const can = adminAbilities(staff.roles);
  const supabase = await createUserClient();
  const { data: v } = await supabase.from("workbook_versions").select("id, workbook_id, semver").eq("id", version).maybeSingle();
  if (!v) notFound();
  const { data: w } = await supabase.from("workbooks").select("code, title, safety_tier").eq("id", v.workbook_id).maybeSingle();
  const { data: rows } = await supabase
    .from("facilitator_guides")
    .select("id, status, content, content_hash, saved_at, approved_at")
    .eq("version_id", version)
    .neq("status", "withdrawn")
    .limit(1);
  const g = ((rows ?? []) as GuideRow[])[0] ?? null;
  const parsed = g ? parseGuide(g.content) : null;
  const n = NOTICES[Array.isArray(sp.notice) ? (sp.notice[0] ?? "") : (sp.notice ?? "")];

  return (
    <div className="admin-page">
      <AdminBack href="/admin/guides" label="Facilitator guides" />
      <h1>
        Guide for <code>{w?.code}</code> {w?.title}, version {v.semver}
      </h1>
      {n ? (
        <p className={`admin-notice admin-notice-${n.tone}`} role={n.tone === "error" ? "alert" : "status"}>
          {n.text}
        </p>
      ) : null}
      <p className="muted">
        {g ? `${g.status === "approved" ? "Approved" : "Draft"}, content ${shortHash(g.content_hash)}.` : "No guide yet."}{" "}
        {w && w.safety_tier !== "none" ? "This is a wellbeing title: the guide must remind the group of Help now." : null}
      </p>
      <p className="muted small">
        Never ask members to read out or share what they wrote. Claim words are checked as for the workbook. Guides are shown only to group
        leaders.
      </p>

      {!can.releaseVersions ? (
        <p className="admin-note">Owners and editors write guides.</p>
      ) : g?.status === "approved" ? (
        <form action={withdrawGuide} className="admin-form">
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="guide" value={g.id} />
          <label htmlFor="reason">Reason for withdrawing</label>
          <input id="reason" name="reason" maxLength={500} required />
          <button type="submit" className="btn secondary">
            Withdraw this guide
          </button>
        </form>
      ) : (
        <>
          <GuideEditor versionId={version} initialText={prettyJson(g?.content ?? STARTER)} save={saveGuide} disabled={false} />
          {g ? (
            <form action={approveGuide} className="admin-form">
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="guide" value={g.id} />
              <div className="check">
                <input id="confirm" name="confirm" type="checkbox" value="yes" required />
                <label htmlFor="confirm">I have reviewed this guide. Once approved it cannot change.</label>
              </div>
              <button type="submit" className="btn">
                Approve
              </button>
            </form>
          ) : null}
        </>
      )}

      {parsed ? (
        <section aria-labelledby="preview-h">
          <h2 id="preview-h">What leaders see</h2>
          {parsed.units.map((u) => (
            <GuideUnitView key={u.unit_number} unit={u} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
