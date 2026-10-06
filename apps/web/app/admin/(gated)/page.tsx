import type { Metadata } from "next";
import { ROLE_LABELS } from "@/lib/staff-access";
import { getStaffSession } from "@/lib/staff";

export const metadata: Metadata = {
  title: "Staff home",
  robots: { index: false, follow: false },
};

const COMING = [
  { title: "Approvals", line: "Editorial and safety review of submitted workbooks." },
  { title: "Leads", line: "Authors and publishers who have asked to join." },
  { title: "Workbooks", line: "Every workbook by AK code, with status, badge and licence." },
] as const;

/**
 * Staff home (F-080). A plain list of what is coming. Pages render in
 * parallel with their layout, so this page checks the gate itself too.
 * Nothing here reads reader answers, and nothing in admin ever will.
 */
export default async function AdminHomePage() {
  const staff = await getStaffSession("/admin");

  return (
    <div className="admin-home">
      <p className="eyebrow muted">Staff home</p>
      <h1>Akana admin</h1>
      <p>
        Signed in{staff.email ? ` as ${staff.email}` : ""} with{" "}
        {staff.roles.length === 1 ? "the role" : "the roles"}:
      </p>
      <ul className="admin-roles" aria-label="Your staff roles">
        {staff.roles.map((r) => (
          <li key={r}>
            <span className={`badge admin-role admin-role-${r}`}>{ROLE_LABELS[r]}</span>
          </li>
        ))}
      </ul>

      <h2>Coming next</h2>
      <ul className="admin-coming">
        {COMING.map((c) => (
          <li key={c.title} className="card">
            <h3>{c.title}</h3>
            <p className="muted">{c.line}</p>
            <span className="badge">Not built yet</span>
          </li>
        ))}
      </ul>

      <p className="admin-note">No staff role can see reader answers. They are sealed for the reader alone.</p>
    </div>
  );
}
