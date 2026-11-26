import "server-only";
import { getStaffAccess, getStaffSession } from "@/lib/staff";

/**
 * /dev/kit, /dev/screens and /dev/player are for developers and staff (plan 1.7). Outside production (next
 * dev, a local build run with NODE_ENV=development) it is open. In
 * production it needs the same staff session and second factor as /admin;
 * anyone else gets a 404.
 */
export async function requireKitPage(next = "/dev/kit"): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  await getStaffSession(next);
}

export async function kitAllowedForRoute(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  const { decision } = await getStaffAccess();
  return decision === "ok";
}
