import { endedSeatText } from "@/lib/org-billing";
import { formatOrgDate } from "@/lib/org-pilot";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The member's read-only notice after an organisation's licence ends
 * (F-228, 0030 app.my_ended_org_seats). Shown for 90 days, or until the
 * organisation's roster is deleted. Never names a workbook. Renders nothing
 * for everyone else, and nothing if the read fails.
 */
export async function OrgEndedNotice() {
  const rows = await endedSeats();
  if (rows.length === 0) return null;
  return (
    <div className="you-banner org-ended" role="region" aria-label="Access through an organisation">
      {rows.slice(0, 3).map((r) => (
        <p key={`${r.organisation_name}-${r.ended_at}`} className="small">
          {endedSeatText(r.organisation_name, formatOrgDate(r.ended_at))}
        </p>
      ))}
    </div>
  );
}

async function endedSeats(): Promise<{ organisation_name: string; ended_at: string }[]> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("my_ended_org_seats");
    if (error || !Array.isArray(data)) return [];
    return data as { organisation_name: string; ended_at: string }[];
  } catch {
    return [];
  }
}
