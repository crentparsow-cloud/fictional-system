import type { Metadata } from "next";
import Link from "next/link";
import { dashAbilities } from "@/lib/account-lookup";
import { adminAbilities } from "@/lib/admin/permissions";
import { moneyAbilities } from "@/lib/money/permissions";
import { ROLE_LABELS } from "@/lib/staff-access";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Staff home",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Staff home (F-080). Link cards to the admin pages with live counts, each
 * read through the user client so RLS decides. Pages render in parallel with
 * their layout, so this page checks the gate itself too. Nothing here reads
 * reader answers, and nothing in admin ever will.
 */
export default async function AdminHomePage() {
  const staff = await getStaffSession("/admin");
  const can = adminAbilities(staff.roles);
  const supabase = await createUserClient();

  const countOf = async (p: PromiseLike<{ count: number | null; error: { code?: string } | null }>, tag: string) => {
    const { count, error } = await p;
    if (error) {
      console.error(`admin_count_failed_${tag}`, error.code ?? "");
      return null;
    }
    return count ?? 0;
  };

  const [newLeads, liveWorkbooks, organisations, inReview, openAlerts, newSupport] = await Promise.all([
    can.readLeads
      ? countOf(supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"), "leads")
      : Promise.resolve(null),
    countOf(supabase.from("workbooks").select("id", { count: "exact", head: true }).eq("status", "live"), "workbooks"),
    countOf(supabase.from("organisations").select("id", { count: "exact", head: true }), "organisations"),
    // 0016: the queue is every status that is not draft, live, paused or retired.
    can.readReviewQueue
      ? countOf(
          supabase.from("workbooks").select("id", { count: "exact", head: true }).not("status", "in", "(draft,live,paused,retired)"),
          "review",
        )
      : Promise.resolve(null),
    countOf(supabase.from("ops_alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null), "ops"),
    can.readSupport
      ? countOf(supabase.from("support_messages").select("id", { count: "exact", head: true }).eq("status", "new"), "support")
      : Promise.resolve(null),
  ]);

  // Notice and takedown (0022): open notices, for roles that read them.
  const dash = dashAbilities(staff.roles);
  const openNotices = dash.readTakedowns
    ? await countOf(supabase.from("takedown_notices").select("id", { count: "exact", head: true }).in("status", ["received", "reviewing"]), "takedowns")
    : null;

  // Signed licence copies waiting for a staff check (0013).
  const licenceChecks = await countOf(
    supabase.from("licences").select("id", { count: "exact", head: true }).eq("status", "pending_verification"),
    "licences",
  );

  // Customer organisations (0024).
  const customers = await countOf(
    supabase.from("organisations").select("id", { count: "exact", head: true }).in("kind", ["business", "church", "charity", "community_group"]),
    "customers",
  );

  const cards = [
    {
      href: "/admin/leads",
      title: "Leads",
      line: "Authors and publishers who have asked to join.",
      count: newLeads,
      unit: "new",
      closed: !can.readLeads,
    },
    {
      href: "/admin/workbooks",
      title: "Workbooks",
      line: can.pauseWorkbooks ? "Every workbook by AK code, with pause and resume." : "Every workbook by AK code.",
      count: liveWorkbooks,
      unit: "live",
      closed: false,
    },
    {
      href: "/admin/collections",
      title: "Collections and shelves",
      line: "Curated groups of titles across shelves, and the editor's line and featured title for each shelf page.",
      count: null,
      unit: "",
      closed: !can.curateCatalogue,
      noCount: true,
    },
    {
      href: "/admin/organisations",
      title: "Organisations",
      line: "Publishers, author companies and sole authors.",
      count: organisations,
      unit: "in total",
      closed: false,
    },
    {
      href: "/admin/business",
      title: "Customers",
      line: "Businesses, churches, charities and groups: licences, seats and the person who runs each one.",
      count: customers,
      unit: "in total",
      closed: false,
    },
    {
      href: "/admin/authors",
      title: "Authors",
      line: "Invite authors and publishers, approve bios, check signed licences.",
      count: licenceChecks,
      unit: "licences to check",
      closed: false,
    },
    {
      href: "/admin/review",
      title: "Review queue",
      line: "Versions waiting for review, with validator results and the release gate.",
      count: inReview,
      unit: "waiting",
      closed: !can.readReviewQueue,
    },
    {
      href: "/admin/guides",
      title: "Facilitator guides",
      line: "Discussion questions and timings for group leaders, one guide per workbook version.",
      count: null,
      unit: "",
      closed: !can.releaseVersions,
      noCount: true,
    },
    {
      href: "/admin/support",
      title: "Support inbox",
      line: "Messages from the contact form, with saved replies.",
      count: newSupport,
      unit: "new",
      closed: !can.readSupport,
    },
    {
      href: "/admin/ops",
      title: "Alerts",
      line: "Webhook, scheduled job and email failures, and error spikes.",
      count: openAlerts,
      unit: "open",
      closed: false,
    },
    {
      href: "/admin/white-label",
      title: "White-label and demo",
      line: "Tenant brands with a contrast check, tenant catalogues, the demo site and its logins.",
      count: null,
      unit: "",
      closed: false,
      noCount: true,
    },
    {
      href: "/admin/money",
      title: "Money",
      line: "Royalty ledger, refunds, payouts, holds and statements.",
      count: null,
      unit: "",
      closed: !moneyAbilities(staff.roles).read,
      noCount: true,
    },
    {
      href: "/admin/funnel",
      title: "Funnel",
      line: "Daily counts from views to purchases. No people, no answers.",
      count: null,
      unit: "",
      closed: !can.readFunnel,
      noCount: true,
    },
    {
      href: "/admin/analytics",
      title: "Analytics",
      line: "Funnel to first unit and checkout, where readers stop, finished steps per week by cohort, trial cancels. Counts only.",
      count: null,
      unit: "",
      closed: !can.readFunnel,
      noCount: true,
    },
    {
      href: "/admin/lookup",
      title: "Account lookup",
      line: "Find a reader by email for a support case. Every lookup is logged with a reason.",
      count: null,
      unit: "",
      closed: !dash.lookupAccounts,
      noCount: true,
    },
    {
      href: "/admin/takedowns",
      title: "Notices and takedowns",
      line: "Copyright and other notices, counter-notices and takedowns.",
      count: openNotices,
      unit: "open",
      closed: !dash.readTakedowns,
    },
  ];

  return (
    <div className="admin-home">
      <p className="eyebrow muted">Staff home</p>
      <h1>Akana admin</h1>
      <p>
        Signed in{staff.email ? ` as ${staff.email}` : ""} with {staff.roles.length === 1 ? "the role" : "the roles"}:
      </p>
      <ul className="admin-roles" aria-label="Your staff roles">
        {staff.roles.map((r) => (
          <li key={r}>
            <span className={`badge admin-role admin-role-${r}`}>{ROLE_LABELS[r]}</span>
          </li>
        ))}
      </ul>

      <ul className="admin-cards">
        {cards.map((c) => (
          <li key={c.href}>
            {c.closed ? (
              <div className="card admin-card is-closed">
                <h2>{c.title}</h2>
                <p className="muted">{c.line}</p>
                <p className="admin-card-count muted">Not open to your role</p>
              </div>
            ) : (
              <Link href={c.href} className="card admin-card">
                <h2>{c.title}</h2>
                <p className="muted">{c.line}</p>
                <p className="admin-card-count">
                  {"noCount" in c && c.noCount ? (
                    <span className="muted">{c.href === "/admin/lookup" ? "Open the lookup" : c.href === "/admin/money" ? "Open the ledger" : c.href === "/admin/guides" ? "Open the guides" : "Open the counts"}</span>
                  ) : c.count === null ? (
                    <span className="muted">Count unavailable</span>
                  ) : (
                    <>
                      <strong>{c.count}</strong> {c.unit}
                    </>
                  )}
                </p>
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="admin-note">No staff role can see reader answers. They are sealed for the reader alone.</p>
    </div>
  );
}
