import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { labelOf } from "@/lib/org-pilot";
import { GROUP_STATUS_LABELS } from "@/lib/org-groups";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Groups you lead", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Led {
  group_id: string;
  group_name: string;
  organisation_name: string;
  status: string;
  role: string;
}

/** The groups the signed-in person leads (F-210). Leaders need no organisation role. */
export default async function LeadIndexPage() {
  const session = await getReaderSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent("/org/lead")}`);
  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("my_led_org_groups");
  if (error) console.error("org_led_groups_failed", error.code ?? "");
  const rows = (data ?? []) as Led[];

  return (
    <div className="admin-page studio-page org-console">
      <h1>Groups you lead</h1>
      {rows.length === 0 ? (
        <div className="card admin-empty">
          <p>You do not lead a group. If your organisation has asked you to, accept the appointment in Groups in your Akana app.</p>
          <p>
            <Link href="/groups">Go to your groups</Link>
          </p>
        </div>
      ) : (
        <ul className="group-list">
          {rows.map((r) => (
            <li key={r.group_id} className="card">
              <h2>
                <Link href={`/org/lead/${r.group_id}`}>{r.group_name}</Link>
              </h2>
              <p className="muted">
                {r.organisation_name}. {r.role === "leader" ? "Leader" : "Co-leader"}. {labelOf(GROUP_STATUS_LABELS, r.status)}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
