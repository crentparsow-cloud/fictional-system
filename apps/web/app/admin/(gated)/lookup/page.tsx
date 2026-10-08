import type { Metadata } from "next";
import { dashAbilities } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import { supportAbilities } from "@/lib/support-actions";
import { AdminBack } from "../_components/Bits";
import { LookupConsole } from "./LookupConsole";

export const metadata: Metadata = { title: "Account lookup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Account lookup (F-087). Find a reader by email to help with a support
 * case: account status, purchases, membership, access, consents and
 * deletion. Never answers. Every lookup needs a reason and is logged with
 * your name, whether or not an account is found.
 *
 * Four actions, each with a reason and an audit row (0021, 0027): refund a
 * single workbook (owner and finance), resend the purchase or membership
 * email (owners, editors, support), restore access and cancel a pending
 * deletion for the reader (owners and support).
 */
export default async function AdminLookupPage() {
  const staff = await getStaffSession("/admin/lookup");
  const can = dashAbilities(staff.roles);
  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Account lookup</h1>
      <p className="muted">
        Look up a reader by email to help with a support case. Each lookup is logged with your name and your reason, and the reader&rsquo;s account shows
        the last ten lookups. Answers are sealed for the reader alone and never appear here. Refunds, resent emails, restored access and cancelled deletions
        each need a reason too.
      </p>
      {can.lookupAccounts ? (
        <LookupConsole can={supportAbilities(staff.roles)} />
      ) : (
        <p className="admin-note">Account lookup is open to owners, editors and support.</p>
      )}
    </div>
  );
}
