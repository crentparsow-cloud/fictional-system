import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAdminDate, isUuid, mailtoHref } from "@/lib/admin/leads";
import { adminAbilities } from "@/lib/admin/permissions";
import { GROUP_CONCERN_REPLY, GROUP_CONCERN_TOPIC, INBOX_TOPIC_LABELS, SAVED_REPLIES, SUPPORT_STATUSES, SUPPORT_STATUS_LABELS, isSupportTopic } from "@/lib/admin/support";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, labelFor } from "../../_components/Bits";
import { Notice } from "../../_components/Notice";
import { setSupportStatus } from "../actions";

export const metadata: Metadata = { title: "Support message", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Message {
  id: string;
  created_at: string;
  topic: string;
  name: string;
  email: string;
  message: string;
  status: string;
  org_group_id: string | null;
}

/** One support message, the saved reply for its topic and the status change (F-090). */
export default async function SupportMessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const staff = await getStaffSession("/admin/support");
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const can = adminAbilities(staff.roles);
  if (!can.readSupport) notFound();

  const supabase = await createUserClient();
  const { data, error } = await supabase.from("support_messages").select("id, created_at, topic, name, email, message, status, org_group_id").eq("id", id).maybeSingle();
  if (error) console.error("admin_support_message_failed", error.code ?? "");
  if (!data) notFound();
  const m = data as Message;
  const mail = mailtoHref(m.email);
  const saved = m.topic === GROUP_CONCERN_TOPIC ? GROUP_CONCERN_REPLY : isSupportTopic(m.topic) ? SAVED_REPLIES[m.topic] : SAVED_REPLIES.other;
  // F-216: which group the concern is about. Staff only; never shown to the organisation.
  const group = m.org_group_id
    ? (((await supabase.from("org_groups").select("name, organisations(display_name, kind)").eq("id", m.org_group_id).maybeSingle()).data ?? null) as {
        name: string;
        organisations: { display_name: string; kind: string } | null;
      } | null)
    : null;

  return (
    <div className="admin-page">
      <AdminBack href="/admin/support" label="Support inbox" />
      <h1>{m.name}</h1>
      <p>
        {mail ? <a href={mail}>{m.email}</a> : m.email}{" "}
        <span className={`badge admin-status admin-status-${m.status}`}>{labelFor(SUPPORT_STATUS_LABELS, m.status)}</span>
      </p>
      <Notice code={sp.notice} />
      {m.topic === "worried" ? (
        <p className="admin-notice admin-notice-error" role="note">
          This person is worried about someone. Reply today. Akana is not a crisis service: point them to emergency services and the Help now page.
        </p>
      ) : null}

      {m.topic === GROUP_CONCERN_TOPIC ? (
        <p className="admin-notice admin-notice-error" role="note">
          A concern about an organisation&apos;s group. Reply today. Do not contact the organisation or the group leader without the person&apos;s
          agreement. Akana is not a safeguarding service: for church groups, point them to the church&apos;s safeguarding lead.
        </p>
      ) : null}
      <dl className="admin-dl card">
        <div>
          <dt>Received</dt>
          <dd>{formatAdminDate(m.created_at)}</dd>
        </div>
        <div>
          <dt>About</dt>
          <dd>{labelFor(INBOX_TOPIC_LABELS, m.topic)}</dd>
        </div>
        {group ? (
          <div>
            <dt>Group</dt>
            <dd>
              {group.name}, {group.organisations?.display_name ?? "organisation"}
              {group.organisations?.kind === "church" ? " (church)" : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <h2>Message</h2>
      <p className="card admin-message">{m.message}</p>

      <h2>Saved reply: {saved.title}</h2>
      <p className="muted small">Copy it into the team inbox, fill in anything in square brackets, and reply from there.</p>
      <p className="card admin-message">{saved.body}</p>

      {can.updateSupport ? (
        <section aria-labelledby="sup-status-h">
          <h2 id="sup-status-h">Change status</h2>
          <p className="muted">Each change is written to the audit log.</p>
          <div className="admin-actions">
            {SUPPORT_STATUSES.filter((s) => s !== m.status).map((s) => (
              <form key={s} action={setSupportStatus}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="status" value={s} />
                <button type="submit" className="btn secondary">
                  Mark as {SUPPORT_STATUS_LABELS[s].toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
