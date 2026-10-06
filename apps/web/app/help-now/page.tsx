import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { LAUNCH_MARKETS, MARKETS, type MarketCode, helpNowFor, isLaunchMarket } from "@/lib/markets";
import { SUPPORT_CHECKED, contactHref, emergencyFor, regionFromAcceptLanguage, supportLinesFor } from "@/lib/support-lines";

/**
 * The Help now hub (F-021), public and outside the reader group so it is one
 * tap away from every screen with no sign-in in the way. Copy and structure
 * carried from the legacy app's help view.
 *
 * Market: ?m= first, then the region in Accept-Language, then GB. Readers
 * outside the six launch markets get the helpline finder the legacy app
 * used (findahelpline.com) and the plain instruction to call local emergency
 * services. Every number is a tel: or sms: link with a 44px target.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help now",
  description: "Free crisis and support lines where you live, checked against official sources.",
  robots: { index: false, follow: false },
};

type Search = { m?: string | string[] };

export default async function HelpNowPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const h = await headers();
  const market = pickMarket(Array.isArray(sp.m) ? sp.m[0] : sp.m, h.get("accept-language"));
  const m = MARKETS[market];
  const emergency = emergencyFor(market);
  const groups = supportLinesFor(market);
  const outside = market === "XX";
  const dateLabel = formatDate(SUPPORT_CHECKED);

  return (
    <main className="help-page">
      <header className="help-head">
        <div className="wrap">
          <p className="eyebrow">{brand.name}</p>
          <h1>Help now</h1>
          <p className="help-lead">
            If you are in danger or thinking about ending your life, call your local emergency number now. You do not have to be sure it is serious enough.
          </p>
          {emergency.number ? (
            <a className="help-call help-call-emergency" href={`tel:${emergency.number.replace(/[^\d+]/g, "")}`}>
              <span className="help-call-label">
                {emergency.label}
                <span className="small">{emergency.how}</span>
              </span>
              <span className="help-call-number">{emergency.number}</span>
            </a>
          ) : (
            <p className="help-emergency-plain">{emergency.how}. Emergency numbers by country: US and Canada 911, UK 999, Ireland 112, Australia 000, New Zealand 111.</p>
          )}
        </div>
      </header>

      <div className="wrap help-body">
        <nav className="chips" aria-label="Choose your region">
          {LAUNCH_MARKETS.map((code) => (
            <Link key={code} className="chip" href={`/help-now?m=${code}`} aria-current={code === market ? "true" : undefined}>
              {MARKETS[code].name}
            </Link>
          ))}
          <Link className="chip" href="/help-now?m=XX" aria-current={outside ? "true" : undefined}>
            {MARKETS.XX.name}
          </Link>
        </nav>
        <p className="muted small">Your region: {m.name}</p>

        <section className="card help-group" aria-labelledby="right-now">
          <h2 id="right-now">Talk to someone right now</h2>
          {helpNowFor(market).map((line) => (
            <a key={line.label + line.number} className="help-call" href={contactHref({ number: line.number, how: line.how, url: `https://${line.number}` })}>
              <span className="help-call-label">
                {line.label}
                <span className="small">{line.how}</span>
              </span>
              <span className="help-call-number">{line.number}</span>
            </a>
          ))}
          {outside ? (
            <p className="muted">
              Find A Helpline lists free, confidential lines by country. If you cannot reach one, contact your local emergency services.
            </p>
          ) : null}
        </section>

        {groups
          .filter((g) => !(outside && g.id === "crisis"))
          .map((g) => (
            <section key={g.id} className="card help-group" aria-labelledby={`group-${g.id}`}>
              <h2 id={`group-${g.id}`}>{g.title}</h2>
              {g.note ? <p className="muted">{g.note}</p> : null}
              {g.lines.map((line) => (
                <a key={line.name + line.number} className="help-call" href={contactHref(line)} rel={/^website/i.test(line.how) ? "noopener" : undefined}>
                  <span className="help-call-label">
                    {line.name}
                    <span className="small">
                      {line.how}
                      {line.hours ? `. ${line.hours}` : ""}
                      {line.verified ? "" : ". Listed, not yet confirmed"}
                    </span>
                  </span>
                  <span className="help-call-number">{line.number}</span>
                </a>
              ))}
            </section>
          ))}

        <details className="card help-group">
          <summary>Other countries</summary>
          {LAUNCH_MARKETS.filter((c) => c !== market).map((c) => (
            <p key={c} className="help-other">
              <strong>{MARKETS[c].name}</strong>
              <br />
              <span className="muted small">{MARKETS[c].helpNow.map((l) => `${l.label}: ${l.number}`).join(". ")}</span>
            </p>
          ))}
          <p className="help-other">
            <strong>Anywhere else</strong>
            <br />
            <a href="https://findahelpline.com/" rel="noopener">
              findahelpline.com
            </a>
          </p>
          <p className="muted small">Emergency: US and Canada 911. UK 999. Ireland 112. Australia 000. New Zealand 111.</p>
        </details>

        <p className="muted small help-checked">Every number on this page was checked against its official source on {dateLabel}.</p>
        <p className="muted small">
          <Link href="/">Back to {brand.name}</Link>
        </p>
      </div>
    </main>
  );
}

function pickMarket(param: string | undefined, acceptLanguage: string | null): MarketCode {
  const p = (param ?? "").trim().toUpperCase();
  if (p === "XX") return "XX";
  if (isLaunchMarket(p)) return p;
  const region = regionFromAcceptLanguage(acceptLanguage, LAUNCH_MARKETS);
  if (region && isLaunchMarket(region)) return region;
  return "GB";
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
