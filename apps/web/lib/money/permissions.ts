import { knownRoles, type PlatformRole } from "@/lib/staff-access";

/**
 * What a staff member may see and do on the money pages (M6), by platform
 * role. This only decides what the UI shows; the SQL functions in migration
 * 0021 check the same roles again:
 *
 *   read ledger, receipts, payouts      app.is_money_staff: owner, finance
 *   refund, hold, approve, run payouts  owner, finance
 *   set royalty figures, adjustments    owner
 */
export interface MoneyAbilities {
  read: boolean;
  refund: boolean;
  holds: boolean;
  approve: boolean;
  runPayouts: boolean;
  setConfig: boolean;
  adjust: boolean;
}

const MONEY: readonly PlatformRole[] = ["owner", "finance"];

export function moneyAbilities(rawRoles: readonly unknown[] | null | undefined): MoneyAbilities {
  const roles = knownRoles(rawRoles);
  const money = roles.some((r) => MONEY.includes(r));
  const owner = roles.includes("owner");
  return { read: money, refund: money, holds: money, approve: money, runPayouts: money, setConfig: owner, adjust: owner };
}
