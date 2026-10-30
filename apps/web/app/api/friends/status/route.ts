import { NextResponse } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { loadMyPairs } from "@/lib/friends/server";

/**
 * The polling fallback for "friend finished a step" (6.2):
 *
 *   GET /api/friends/status -> { pairs: [{ pairId, friendFinishedToday, friendFinishedThisWeek, iFinishedToday, nudgeSentToday, nudgeCode }] }
 *
 * The signed-in reader's own pairings, as public.my_pairs returns them:
 * status flags and a nudge code only. No ids of the other person, no
 * answers. Never stored by a cache.
 */
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const session = await getReaderSession();
  if (!session) return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: NO_STORE });
  const pairs = await loadMyPairs();
  return NextResponse.json(
    {
      pairs: pairs
        .filter((p) => p.status === "active")
        .map((p) => ({ pairId: p.pairId, friendFinishedToday: p.friendFinishedToday, friendFinishedThisWeek: p.friendFinishedThisWeek ?? false, iFinishedToday: p.iFinishedToday, nudgeSentToday: p.nudgeSentToday, nudgeCode: p.nudgeCode })),
    },
    { headers: NO_STORE },
  );
}
