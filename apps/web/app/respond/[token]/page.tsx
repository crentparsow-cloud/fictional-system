import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import {
  calmLinkPage,
  cleanName,
  FEATURE_NAME,
  hashToken,
  isTokenShaped,
  outcomeMessage,
  parseOutcome,
  parseShareLevel,
  SHARE_LEVELS,
  type Calm,
  type LinkState,
  type PartnerStatus,
  type TokenPurpose,
} from "@/lib/partner";
import { createUserClient } from "@/lib/supabase/server";

/**
 * The check-in partner's page (F-030), opened from an email link. Public:
 * the partner has no account. The token in the path is the key.
 *
 * Opening the page never changes anything. Only a button press does, by
 * POST to /api/partner/respond, so mail scanners that open links cannot act
 * for anyone. The page reads what the link is for through
 * public.partner_link_view, which returns first names and the share level
 * and nothing else: no address, no id, nothing from the reader's work.
 *
 * Never cached, never indexed, and no referrer leaves this page (headers in
 * next.config.ts, metadata below). A link that is malformed, unknown,
 * expired or revoked gets the same calm page, and a lookup that fails is
 * treated as unknown.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: FEATURE_NAME,
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type View = { state: LinkState; purpose: TokenPurpose | null; status: PartnerStatus | null; partnerName: string; readerName: string; level: 1 | 2 | 3 };

async function lookup(token: string): Promise<View> {
  const unknown: View = { state: "unknown", purpose: null, status: null, partnerName: "", readerName: "", level: 1 };
  if (!isTokenShaped(token)) return unknown;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("partner_link_view", { p_token_hash: await hashToken(token) });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { state: LinkState; purpose: TokenPurpose | null; partner_status: PartnerStatus | null; partner_name: string | null; reader_name: string | null; share_level: number | null }
      | undefined;
    if (error || !row || !row.state) return unknown;
    return {
      state: row.state,
      purpose: row.purpose,
      status: row.partner_status,
      partnerName: cleanName(row.partner_name),
      readerName: cleanName(row.reader_name),
      level: parseShareLevel(row.share_level) ?? 1,
    };
  } catch {
    return unknown;
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RespondPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const view = await lookup(token);
  const reader = view.readerName || "your friend";
  const Reader = view.readerName || "Your friend";
  const done = parseOutcome(first(sp.done));

  // After a button press: say what happened. Only for a link we know.
  if (done && view.state !== "unknown") return <Shell calm={outcomeMessage(done, view.readerName)} />;
  if (view.state === "unknown" || view.state === "expired" || view.state === "revoked") return <Shell calm={calmLinkPage(view.state)} />;
  if (view.state === "used") return <Shell calm={usedPage(view)} />;

  const hi = view.partnerName ? `Hi ${view.partnerName},` : "Hello,";

  if (view.purpose === "respond") {
    if (view.status === "accepted") return <Shell calm={{ title: "You've already said yes", body: `Thank you. You'll get a short note when ${reader} reaches a new stage.` }} />;
    if (view.status !== "invited") return <Shell calm={calmLinkPage("inactive")} />;
    if (first(sp.a) === "decline") {
      return (
        <Shell calm={{ title: "Say no thanks?", body: "You won't hear from us again, and no more invitations will reach this address." }}>
          <ActionForm token={token} action="decline" label="No, thank you" />
          <p className="small">
            <a href={`/respond/${token}`}>Go back to the invitation</a>
          </p>
        </Shell>
      );
    }
    return (
      <Shell calm={{ title: `${Reader} would like you as their check-in partner`, body: `${hi} ${Reader} is working through a guided workbook on ${brand.name}, one small step at a time.` }}>
        <div className="respond-panel">
          <h2>What you&apos;d get</h2>
          <ul>
            {SHARE_LEVELS[view.level].partnerGets.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>A way to send a few kind words back.</li>
          </ul>
          <h2>What you won&apos;t see</h2>
          <p>Their answers, what they write, or which workbook they&apos;re using. You&apos;re not being asked to check on them, or to act as an emergency contact.</p>
        </div>
        <div className="respond-actions">
          <ActionForm token={token} action="accept" label="Yes, send me updates" />
          <ActionForm token={token} action="decline" label="No, thank you" secondary />
        </div>
        <p className="small muted">You can stop at any time. Every email has a link to stop.</p>
      </Shell>
    );
  }

  if (view.purpose === "report") {
    return (
      <Shell calm={{ title: "Report this invitation?", body: "If you weren't expecting it, report it. No more invitations will reach your address, from anyone." }}>
        <ActionForm token={token} action="report" label="Report and block" />
      </Shell>
    );
  }

  if (view.purpose === "stop") {
    if (view.status === "stopped") return <Shell calm={{ title: "Updates are stopped", body: "You won't get any more updates." }} />;
    if (view.status !== "accepted") return <Shell calm={calmLinkPage("inactive")} />;
    return (
      <Shell calm={{ title: "Stop updates?", body: `You won't get any more updates about ${reader}. They'll see in the app that updates have stopped.` }}>
        <ActionForm token={token} action="stop" label="Stop updates" />
      </Shell>
    );
  }

  if (view.purpose === "reply") {
    if (view.status !== "accepted") return <Shell calm={calmLinkPage("inactive")} />;
    return (
      <Shell calm={{ title: `Send ${reader} a few kind words`, body: `${Reader} will see your message in the app. Keep it short and kind. Links, email addresses and phone numbers are taken out.` }}>
        <form method="post" action="/api/partner/respond" className="respond-form">
          <input type="hidden" name="t" value={token} />
          <input type="hidden" name="a" value="reply" />
          <label className="q" htmlFor="respond-message">
            Your message
          </label>
          <textarea id="respond-message" name="message" rows={4} maxLength={280} required />
          <p className="small muted">Up to 280 characters. One message for each update email.</p>
          <button type="submit" className="btn">
            Send
          </button>
        </form>
      </Shell>
    );
  }

  return <Shell calm={calmLinkPage("unknown")} />;
}

function usedPage(view: View): Calm {
  const reader = view.readerName || "your friend";
  if (view.purpose === "respond" && view.status === "accepted") return { title: "You've already said yes", body: `Thank you. You'll get a short note when ${reader} reaches a new stage.` };
  if (view.purpose === "respond" && view.status === "declined") return { title: "Already done", body: "You said no thanks. You won't hear from us again." };
  if (view.purpose === "reply") return { title: "Message sent", body: "Your message from this email has been sent. Each update email lets you send one." };
  if (view.purpose === "stop") return { title: "Updates are stopped", body: "You won't get any more updates." };
  if (view.purpose === "report") return { title: "Reported and blocked", body: "No more invitations will reach your address." };
  return calmLinkPage("used");
}

function ActionForm({ token, action, label, secondary }: { token: string; action: string; label: string; secondary?: boolean }) {
  return (
    <form method="post" action="/api/partner/respond">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="a" value={action} />
      <button type="submit" className={secondary ? "btn secondary" : "btn"}>
        {label}
      </button>
    </form>
  );
}

function Shell({ calm, children }: { calm: Calm; children?: React.ReactNode }) {
  return (
    <main className="respond-page">
      <section className="card respond-card" aria-labelledby="respond-title">
        <p className="eyebrow">
          {brand.name} · {FEATURE_NAME}
        </p>
        <h1 id="respond-title">{calm.title}</h1>
        <p>{calm.body}</p>
        {children}
      </section>
    </main>
  );
}
