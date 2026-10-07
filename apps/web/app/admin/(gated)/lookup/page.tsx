import type { Metadata } from "next";
import { dashAbilities } from "@/lib/account-lookup";
import { getStaffSession } from "@/lib/staff";
import { AdminBack } from "../_components/Bits";
import { LookupConsole } from "./LookupConsole";

export const metadata: Metadata = { title: "Account lookup", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Account lookup (F-087). Find a reader by email to help with a support
 * case: account status, purchases, membership, access, consents and
 * deletion. Never answers. Every lookup needs a reason and is logged with
 * your name, whether or not an account is found.
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
        the last ten lookups. Answers are sealed for the reader alone and never appear here.
      </p>
      {can.lookupAccounts ? (
        <LookupConsole />
      ) : (
        <p className="admin-note">Account lookup is open to owners, editors and support.</p>
      )}
    </div>
  );
}
