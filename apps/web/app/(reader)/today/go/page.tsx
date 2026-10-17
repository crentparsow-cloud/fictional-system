import { redirect } from "next/navigation";
import { getReaderSession } from "@/lib/auth";
import { resolveNextStep } from "@/lib/today/server";

/**
 * /today/go (12.10): a bookmarkable address that opens straight to the step.
 * It finds the reader's next unfinished step, or the place they paused, and
 * sends them there. With nothing to open it lands on Today. The reader
 * layout has already sent anyone signed out to sign-in with this address as
 * the place to come back to, so a bookmark works from a cold start.
 *
 * ?e=<programme> prefers that programme, which is how the link in a reminder
 * email and in the calendar feed picks its programme.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TodayGo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.e) ? sp.e[0] : sp.e;
  const session = await getReaderSession();
  if (!session) redirect("/sign-in?next=/today/go");
  let href: string | null = null;
  try {
    href = await resolveNextStep(session.userId, raw && UUID.test(raw) ? raw : null);
  } catch {
    href = null;
  }
  redirect(href ?? "/today");
}
