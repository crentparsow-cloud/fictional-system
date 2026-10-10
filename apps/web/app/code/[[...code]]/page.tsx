import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { PublicBuy, type PaidLines } from "@/components/catalogue/PublicBuy";
import { getReaderSession } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { getWorkbookBySlug, listLibrary } from "@/lib/catalogue";
import { unitWord } from "@/lib/catalogue-guard";
import { normalisePromoCode, offerSummary, PROMO_MESSAGES, type PromoOffer } from "@/lib/promo-code";
import { lookupPromoCode } from "@/lib/promo-code-server";
import { marketForReader, paidLinesFor, publicOffer, type PublicOffer } from "@/lib/public-offer";

/**
 * The code page (item 5.9): /code, /code/AKANA or /code?c=AKANA. A reader
 * enters or arrives with a promotion code. The page checks it against
 * Stripe's promotion codes (test mode until launch), lets the reader choose
 * a workbook or the membership, says the total they will pay in plain words
 * and carries the code into Checkout, where the same code is pinned to the
 * session. The code is never trusted from the URL: the checkout route looks
 * it up again.
 *
 * Nothing on this page says "was", strikes a price through or counts down.
 * Demo titles are not offered. The code itself is Crent's to create in Stripe.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Use a code",
  description: `Enter a ${brand.name} code to see the price you will pay for a workbook or the membership.`,
  robots: { index: false, follow: true },
};

type Params = { code?: string[] };
type Search = { c?: string | string[]; w?: string | string[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CodePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const [{ code: pathCode }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const typed = one(sp.c) || pathCode?.[0] || "";
  const code = normalisePromoCode(typed);
  const chosen = one(sp.w);
  const slug = SLUG.test(chosen) ? chosen : null;
  const membershipOnly = chosen === "membership";

  let promo: PromoOffer | null = null;
  let note: string | null = null;
  if (typed && !code) note = PROMO_MESSAGES.unknown;
  if (code) {
    const found = await lookupPromoCode(code, session ? `user:${session.userId}` : "anon");
    if (found.ok) promo = found.offer;
    else note = PROMO_MESSAGES[found.reason];
  }

  const market = await marketForReader(session?.userId ?? null);
  // Titles that can be bought: live, complete (policy 7.9) and not demo.
  const titles = promo ? (await listLibrary()).filter((c) => !c.isDemo) : [];
  const detail = promo && slug ? await getWorkbookBySlug(slug) : null;
  const title = detail && !detail.card.isDemo ? detail : null;

  let offer: PublicOffer | null = null;
  let paidLines: PaidLines | null = null;
  if (promo && title) {
    offer = await publicOffer({ pricePointId: title.pricePointId, isDemo: false, inMembership: title.inMembership }, market);
    paidLines = paidLinesFor(offer, promo);
  } else if (promo && membershipOnly) {
    offer = await publicOffer({ pricePointId: null, isDemo: false, inMembership: true }, market);
    paidLines = paidLinesFor(offer, promo);
  }

  const query = (w: string | null) => `/code?c=${encodeURIComponent(code ?? "")}${w ? `&w=${encodeURIComponent(w)}` : ""}`;
  const returnTo = `${query(title ? title.card.slug : membershipOnly ? "membership" : null)}#buy`;
  const unit = title ? unitWord(title).toLowerCase() : "unit";

  return (
    <main className="wrap info-page code-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>Use a code</h1>
        <p className="info-lead">Enter your code to see what you will pay. The price shown is the price you pay. Codes are applied on the payment page.</p>
      </header>

      <section className="info-section" aria-labelledby="code-enter">
        <h2 id="code-enter">Your code</h2>
        <form className="code-form" action="/code" method="get">
          <label htmlFor="code-c">Code</label>
          <div className="admin-search-row">
            <input id="code-c" name="c" type="text" defaultValue={code ?? typed.slice(0, 40)} maxLength={40} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn secondary">
              Check the code
            </button>
          </div>
          {note ? (
            <p className="small form-error" role="alert">
              {note}
            </p>
          ) : null}
          {promo ? (
            <p role="status">
              {offerSummary(promo, market)}
              {promo.firstTimeOnly ? ` ${PROMO_MESSAGES.firstTimeOnly}` : ""}
            </p>
          ) : null}
        </form>
      </section>

      {promo ? (
        <section className="info-section" aria-labelledby="code-choose">
          <h2 id="code-choose">What would you like it for?</h2>
          <form className="code-form" action="/code" method="get">
            <input type="hidden" name="c" value={promo.code} />
            <label htmlFor="code-w">Workbook or membership</label>
            <div className="admin-search-row">
              <select id="code-w" name="w" defaultValue={title ? title.card.slug : membershipOnly ? "membership" : ""}>
                <option value="">Choose</option>
                <option value="membership">The membership</option>
                {titles.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn secondary">
                Show the price
              </button>
            </div>
          </form>

          {title && offer ? (
            <div className="card info-plan code-offer">
              <h3>{title.card.title}</h3>
              <p className="muted">{title.card.cardLine}</p>
              <p className="small">
                <Link href={`/w/${title.card.slug}?code=${encodeURIComponent(promo.code)}`}>About this workbook</Link>. The first {unit} is free to read before you decide.
              </p>
              <PublicBuy
                slug={title.card.slug}
                state={offer.state}
                signedIn={Boolean(session)}
                returnTo={returnTo}
                start={null}
                outlineOnlyLabel={null}
                code={promo.code}
                paidLines={paidLines}
              />
            </div>
          ) : membershipOnly && offer ? (
            <div className="card info-plan code-offer">
              <h3>Membership</h3>
              <p className="muted">Every workbook in the membership. Renews until you cancel.</p>
              <PublicBuy slug={null} state={offer.state} signedIn={Boolean(session)} returnTo={returnTo} start={null} outlineOnlyLabel={null} code={promo.code} paidLines={paidLines} />
            </div>
          ) : slug && !title ? (
            <p className="muted">That workbook is not on sale. Choose another from the list.</p>
          ) : null}
        </section>
      ) : null}

      <InfoFooter />
    </main>
  );
}
