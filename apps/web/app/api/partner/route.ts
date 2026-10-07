import { NextResponse, type NextRequest } from "next/server";
import { getReaderSession } from "@/lib/auth";
import { isSameOriginPost, originFrom, PARTNER_HEADERS, type PartnerNotice } from "@/lib/partner";
import { invitePartner, inviteLimiter, saveSettings, stopSharing, type Rpc } from "@/lib/partner-flow";
import { createPartnerMail, mailerEnvFromProcess } from "@/lib/partner-mail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The reader's check-in partner controls (F-030). POST from the forms in
 * the Check-in partner section of the You page, then 303 back there with a
 * notice. op is one of:
 *
 *   invite    name, email, share level, the wellbeing choice. The tokens are
 *             minted here and only their hashes reach the database, through
 *             public.partner_invite, which is service role only so a reader
 *             can never hold their partner's links. The signed-in session
 *             decides whose partner it is.
 *   settings  share level, wellbeing choice, note. Runs as the reader.
 *   stop      stop sharing. Runs as the reader; the partner is told.
 *   forget    remove a partner's details after sharing has ended.
 *
 * Same-origin form posts only. Nothing is logged but status words.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = originFrom(request.headers);
  const back = (notice: PartnerNotice) =>
    NextResponse.redirect(`${origin}/you?partner=${notice}#check-in-partner`, { status: 303, headers: PARTNER_HEADERS });

  if (!isSameOriginPost(request.headers)) return new NextResponse("Forbidden", { status: 403, headers: PARTNER_HEADERS });
  const session = await getReaderSession();
  if (!session) return NextResponse.redirect(`${origin}/sign-in?next=/you`, { status: 303, headers: PARTNER_HEADERS });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return back("failed");
  }
  const op = String(fd.get("op") ?? "");
  const user = await createUserClient();
  const userRpc: Rpc = (fn, args) => user.rpc(fn, args);
  const mail = createPartnerMail({ env: mailerEnvFromProcess(), origin });

  try {
    if (op === "invite") {
      const admin = createAdminClient();
      const notice = await invitePartner(
        {
          readerName: fd.get("reader_name"),
          partnerName: fd.get("partner_name"),
          email: fd.get("partner_email"),
          shareLevel: fd.get("share_level"),
          includeWellbeing: fd.get("include_wellbeing"),
        },
        { userId: session.userId, readerEmail: session.email, rpc: (fn, args) => admin.rpc(fn, args), mail, limiter: inviteLimiter },
      );
      return back(notice);
    }
    if (op === "settings") {
      return back(
        await saveSettings(
          { shareLevel: fd.get("share_level"), includeWellbeing: fd.get("include_wellbeing"), note: fd.get("note") },
          { rpc: userRpc },
        ),
      );
    }
    if (op === "stop") return back(await stopSharing({ rpc: userRpc, mail }));
    if (op === "forget") {
      const { error } = await user.rpc("partner_forget");
      return back(error ? "failed" : "removed");
    }
  } catch (e) {
    console.error("partner_route_failed", e instanceof Error ? e.name : "unknown");
    return back("failed");
  }
  return back("failed");
}
