import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { GIFT_NOTICES, claimUrl, giftDateWords, giftLength } from "@/lib/gift";
import { loadGiftConfig } from "@/lib/gift-server";
import { siteOrigin } from "@/lib/site-url";
import { createUserClient } from "@/lib/supabase/server";
import { MARKETPLACE_TENANT_ID } from "@/lib/tenant";
import { tenantIdForRequest } from "@/lib/tenant-id";
import { GiftForm } from "./GiftForm";

export const metadata: Metadata = {
  title: "Give a membership",
  description: "Give someone a membership for 1, 3, 6 or 12 months. You pay once. It does not renew.",
  alternates: { canonical: "/gift" },
};
export const dynamic = "force-dynamic";

const STATUS_WORDS: Record<string, string> = {
  pending: "Waiting for payment",
  paid: "Sent, not yet claimed",
  claimed: "Claimed",
  expired: "Ended",
  refunded: "Refunded",
  failed: "Not paid",
};

/**
 * Give a membership (5.6, 5.7). Anyone can read this page. Paying needs an
 * account, because the gift is tied to who bought it. The buyer sees their
 * own gifts below, with the claim link for any that are unclaimed, in case
 * the email went astray.
 */
export default async function GiftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenantId = await tenantIdForRequest();
  const sp = await searchParams;
  const session = await getReaderSession();
  const supabase = await createUserClient();
  const open = tenantId === MARKETPLACE_TENANT_ID;
  const config = open ? await loadGiftConfig(supabase) : null;
  const options = config?.options ?? [];

  let gifts: { id: string; months: number; status: string; recipient_name: string | null; recipient_email: string | null; claim_token: string | null; created_at: string }[] = [];
  if (session && open) {
    const { data } = await supabase
      .from("gift_memberships")
      .select("id, months, status, recipient_name, recipient_email, claim_token, created_at")
      .eq("buyer_id", session.userId)
      .in("status", ["paid", "claimed", "expired"])
      .order("created_at", { ascending: false })
      .limit(20);
    gifts = (data ?? []) as typeof gifts;
  }
  const origin = siteOrigin();

  return (
    <>
      <main id="main" className="tab-page">
        <h1>Give a membership</h1>
        <p>Give someone a membership for as long as you like. You pay once. Nothing renews. They claim it from a link in an email, and they do not need a card.</p>
        <p>When the gift ends, their account goes back to how it was. Everything they have written stays theirs and stays readable.</p>
        {sp.thanks ? (
          <p className="you-notice" role="status">
            {GIFT_NOTICES.paying}
          </p>
        ) : null}
        {!open || options.length === 0 ? (
          <p>Gifts are not open yet. Please check back soon.</p>
        ) : !session ? (
          <p>
            <Link className="btn" href="/sign-in?next=/gift">
              Sign in to give a membership
            </Link>
          </p>
        ) : config ? (
          <GiftForm options={options.map((o) => ({ months: o.months, label: o.label, price: o.price }))} messageMax={config.messageMax} />
        ) : null}

        {gifts.length ? (
          <section aria-labelledby="gifts-given">
            <h2 id="gifts-given">Gifts you have given</h2>
            <ul className="plain-list">
              {gifts.map((g) => (
                <li key={g.id}>
                  <strong>{giftLength(g.months)}</strong>, {STATUS_WORDS[g.status] ?? g.status}
                  {g.recipient_name ? ` for ${g.recipient_name}` : ""}, bought {giftDateWords(g.created_at)}.
                  {g.status === "paid" && g.claim_token && origin ? (
                    <>
                      {" "}
                      <span className="small muted">Link to pass on yourself: </span>
                      <code>{claimUrl(origin, g.claim_token)}</code>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="small muted">
          Questions? Read <Link href="/help/gift-memberships">how gifts work</Link>.
        </p>
      </main>
      <InfoFooter />
    </>
  );
}
