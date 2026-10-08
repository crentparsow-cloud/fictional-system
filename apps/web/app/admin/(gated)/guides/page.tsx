import type { Metadata } from "next";
import Link from "next/link";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";

export const metadata: Metadata = { title: "Facilitator guides", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface Wb {
  id: string;
  code: string;
  title: string;
  current_version_id: string | null;
}

/**
 * Facilitator guides (F-212). One per workbook version, written by staff,
 * shown only to group leaders. None are seeded. Live titles are listed with
 * the state of the guide for their current version.
 */
export default async function GuidesPage() {
  await getStaffSession("/admin/guides");
  const supabase = await createUserClient();
  const { data: wbs } = await supabase
    .from("workbooks")
    .select("id, code, title, current_version_id")
    .eq("status", "live")
    .eq("is_demo", false)
    .not("current_version_id", "is", null)
    .order("title")
    .limit(500);
  const { data: guides } = await supabase.from("facilitator_guides").select("version_id, status").neq("status", "withdrawn");
  const state = new Map(((guides ?? []) as { version_id: string; status: string }[]).map((g) => [g.version_id, g.status]));
  const rows = (wbs ?? []) as Wb[];

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Facilitator guides</h1>
      <p className="muted">
        A guide gives a group leader discussion questions and timings for each unit. It belongs to one version of a workbook. The author
        licence must allow guides as derived material before one is approved.
      </p>
      {rows.length === 0 ? (
        <div className="card admin-empty">
          <p className="muted">No live workbooks.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Live workbooks and their guides</caption>
            <thead>
              <tr>
                <th scope="col">Workbook</th>
                <th scope="col">Guide for the current version</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/admin/guides/${w.current_version_id}`}>
                      <code>{w.code}</code> {w.title}
                    </Link>
                  </td>
                  <td>{state.get(w.current_version_id ?? "") === "approved" ? "Approved" : state.get(w.current_version_id ?? "") === "draft" ? "Draft" : "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
