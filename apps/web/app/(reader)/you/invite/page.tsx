import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink } from "@/components/you/CopyLink";
import { getReaderSession } from "@/lib/auth";
import { listLibrary } from "@/lib/catalogue";
import { REFERRAL_DEFAULTS, referralConditions, referralConfigFrom, referralSummaryLine, referralUrl } from "@/lib/referral";
import { GIFT_RULES, GIFT_SEND_MESSAGES, isGiftSendStatus, nextQuarterLabel } from "@/lib/send-workbook";
import { siteOrigin } from "@/lib/site-url";
import { createUserClient } from "@/lib/supabase/server";
import { cancelWorkbookGift, sendWorkbookGift } from "./actions";

/**
 * Invite a friend (6.3) and send a workbook (14.14), both reached from the You
 * page. The reader shares their link through their own channels: Akana never
 * emails the friend. The gift form emails only the one address the member
 * types, once, and says nothing about the workbook in the email.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite a friend", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ gift?: string | string[] }> };

const EXTRA_GIFT_MESSAGES: Record<string, string> = {
  invalid: "Check the address and the workbook, then try again.",
  failed: "Something went wrong. Please try again in a moment.",
  mail_failed: "We could not send the email, so nothing has been used. Please try again.",
  cancelled: "Cancelled. Your gift for this quarter is available again.",
};

export default async function InvitePage({ searchParams }: Props) {
  const [sp, session] = await Promise.all([searchParams, getReaderSession()]);
  if (!session) {
    return (
      <main className="wrap you-page">
        <h1>Invite a friend</h1>
        <p>
          <Link className="btn" href={`/sign-in?next=${encodeURIComponent("/you/invite")}`}>
            Sign in
          </Link>
        </p>
      </main>
    );
  }
  const giftRaw = Array.isArray(sp.gift) ? sp.gift[0] : sp.gift;
  const giftMessage = giftRaw ? (isGiftSendStatus(giftRaw) ? GIFT_SEND_MESSAGES[giftRaw] : EXTRA_GIFT_MESSAGES[giftRaw]) : null;

  const supabase = await createUserClient();
  const [codeRes, summaryRes, cfgRes, statusRes, giftsRes] = await Promise.all([
    supabase.rpc("my_referral_code"),
    supabase.rpc("my_referral_summary"),
    supabase.from("app_config").select("value").eq("key", "referral").maybeSingle(),
    supabase.rpc("gift_status"),
    supabase.rpc("my_gifts"),
  ]);
  const code = typeof codeRes.data === "string" ? codeRes.data : null;
  const config = referralConfigFrom((cfgRes.data as { value?: unknown } | null)?.value ?? REFERRAL_DEFAULTS);
  const s = ((summaryRes.data ?? []) as { invited: number; rewarded_this_year: number; cap: number; credit_minor: number | string; credit_currency: string | null }[])[0];
  const status = ((statusRes.data ?? []) as { paying: boolean; used: boolean; quarter: string }[])[0];
  const gifts = (giftsRes.data ?? []) as { id: string; status: string; quarter: string; recipient_email: string | null; created_at: string; expires_at: string; expired: boolean }[];
  const origin = siteOrigin();

  let cards: { id: string; title: string }[] = [];
  if (status?.paying && !status.used) {
    try {
      cards = (await listLibrary({})).filter((c) => !c.isDemo && c.hasVersion && c.depth === "full").map((c) => ({ id: c.id, title: c.title }));
    } catch {
      cards = [];
    }
  }

  return (
    <main className="wrap you-page">
      <p>
        <Link href="/you">Back to You</Link>
      </p>
      <h1>Invite a friend</h1>

      <section className="you-section" aria-labelledby="invite-link">
        <h2 id="invite-link">Your link</h2>
        {code ? (
          <CopyLink
            url={referralUrl(origin, code)}
            label="Your invitation link"
            countAs="referral_link_shared"
            shareText="I use Akana for guided workbooks. This is my invitation link."
          />
        ) : (
          <p role="status">Your link is not available just now. Please try again in a moment.</p>
        )}
        {s ? (
          <p className="small">
            {referralSummaryLine({
              invited: s.invited,
              rewardedThisYear: s.rewarded_this_year,
              cap: s.cap,
              creditMinor: Number(s.credit_minor),
              creditCurrency: s.credit_currency ?? "GBP",
            })}
          </p>
        ) : null}
        <p className="small">Read these before you share it:</p>
        <ul className="small">
          {referralConditions(config).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="you-section" id="gift" aria-labelledby="gift-h">
        <h2 id="gift-h">Send this workbook</h2>
        <ul className="small">
          {GIFT_RULES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {giftMessage ? <p role="status">{giftMessage}</p> : null}
        {!status?.paying ? (
          <p>Sending a workbook is for members who are paying. Once your membership is paying, the form appears here.</p>
        ) : status.used ? (
          <p>You have sent your gift for this quarter. You can send another from {nextQuarterLabel(status.quarter)}.</p>
        ) : (
          <form action={sendWorkbookGift} className="card">
            <p>
              <label htmlFor="gift-workbook">Workbook</label>
              <br />
              <select id="gift-workbook" name="workbook" required defaultValue="">
                <option value="" disabled>
                  Choose a workbook
                </option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </p>
            <p>
              <label htmlFor="gift-email">Their email address</label>
              <br />
              <input id="gift-email" name="email" type="email" required autoComplete="off" />
            </p>
            <p className="small muted">We email this address once with the claim link. We do not keep it after they claim or you take the gift back.</p>
            <button type="submit" className="btn">
              Send the workbook
            </button>
          </form>
        )}

        {gifts.length > 0 ? (
          <>
            <h3>Your gifts</h3>
            <ul>
              {gifts.map((g) => (
                <li key={g.id}>
                  {g.quarter}:{" "}
                  {g.status === "claimed"
                    ? "claimed"
                    : g.status === "cancelled"
                      ? "taken back"
                      : g.status === "returned"
                        ? "not used, so your gift for the quarter is free again"
                      : g.status === "expired" || g.expired
                        ? "not claimed in time"
                        : `waiting${g.recipient_email ? ` for ${g.recipient_email}` : ""}`}
                  {g.status === "sent" && !g.expired ? (
                    <form action={cancelWorkbookGift} style={{ display: "inline", marginInlineStart: "0.5rem" }}>
                      <input type="hidden" name="gift" value={g.id} />
                      <button type="submit" className="btn secondary">
                        Take it back
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </main>
  );
}
