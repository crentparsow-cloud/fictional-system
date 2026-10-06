/**
 * Markets and locale data (F-138), carried from legacy/content/catalog/markets.json
 * and legacy/app/src/locale.js as typed data.
 *
 * Six launch markets plus "everywhere else". Prices, dates and Help now all
 * read from here. Only a two-letter country code is ever stored on a profile.
 */

export type MarketCode = "US" | "GB" | "CA" | "AU" | "IE" | "NZ" | "XX";
export type LaunchMarketCode = Exclude<MarketCode, "XX">;
export type Currency = "usd" | "gbp" | "cad" | "aud" | "eur" | "nzd";
export type CopyLocale = "en-GB" | "en-US";
export type LegalRegion = "us" | "uk" | "ca" | "au" | "eu" | "nz" | "intl";

/** One Help now line: a service a reader can call or text right now. */
export interface HelpLine {
  label: string;
  number: string;
  how: "Call" | "Text" | "Call or text" | "Website" | string;
}

export interface Market {
  code: MarketCode;
  name: string;
  currency: Currency;
  /** The bookshop domain print and ebook links point at. */
  store: string;
  /** Intl locale for dates and money. */
  dateLocale: string;
  /** Which interface and content spelling set the market reads. */
  copyLocale: CopyLocale;
  legal: LegalRegion;
  /** Help now lines, in the order they are shown. */
  helpNow: HelpLine[];
}

export const MARKETS: Readonly<Record<MarketCode, Market>> = {
  US: {
    code: "US",
    name: "United States",
    currency: "usd",
    store: "amazon.com",
    dateLocale: "en-US",
    copyLocale: "en-US",
    legal: "us",
    helpNow: [{ label: "988 Suicide and Crisis Lifeline", number: "988", how: "Call or text" }],
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    currency: "gbp",
    store: "amazon.co.uk",
    dateLocale: "en-GB",
    copyLocale: "en-GB",
    legal: "uk",
    helpNow: [
      { label: "Samaritans", number: "116 123", how: "Call" },
      { label: "Shout", number: "85258", how: "Text SHOUT" },
    ],
  },
  CA: {
    code: "CA",
    name: "Canada",
    currency: "cad",
    store: "amazon.ca",
    dateLocale: "en-CA",
    copyLocale: "en-US",
    legal: "ca",
    helpNow: [{ label: "9-8-8 Suicide Crisis Helpline", number: "988", how: "Call or text" }],
  },
  AU: {
    code: "AU",
    name: "Australia",
    currency: "aud",
    store: "amazon.com.au",
    dateLocale: "en-AU",
    copyLocale: "en-GB",
    legal: "au",
    helpNow: [{ label: "Lifeline", number: "13 11 14", how: "Call" }],
  },
  IE: {
    code: "IE",
    name: "Ireland",
    currency: "eur",
    store: "amazon.co.uk",
    dateLocale: "en-IE",
    copyLocale: "en-GB",
    legal: "eu",
    helpNow: [
      { label: "Samaritans", number: "116 123", how: "Call" },
      { label: "Text About It", number: "50808", how: "Text HELLO" },
    ],
  },
  NZ: {
    code: "NZ",
    name: "New Zealand",
    currency: "nzd",
    store: "amazon.com.au",
    dateLocale: "en-NZ",
    copyLocale: "en-GB",
    legal: "nz",
    helpNow: [{ label: "Need to talk?", number: "1737", how: "Call or text" }],
  },
  XX: {
    code: "XX",
    name: "Everywhere else",
    currency: "usd",
    store: "amazon.com",
    dateLocale: "en-US",
    copyLocale: "en-US",
    legal: "intl",
    helpNow: [{ label: "Find a helpline near you", number: "findahelpline.com", how: "Website" }],
  },
};

export const LAUNCH_MARKETS: readonly LaunchMarketCode[] = ["US", "GB", "CA", "AU", "IE", "NZ"];
export const FALLBACK_MARKET: Market = MARKETS.XX;

export function isLaunchMarket(code: string | null | undefined): code is LaunchMarketCode {
  return !!code && (LAUNCH_MARKETS as readonly string[]).includes(code.toUpperCase());
}

/** The market for a country code. Unknown or missing countries get "everywhere else". */
export function marketFor(country: string | null | undefined): Market {
  const code = (country ?? "").trim().toUpperCase();
  return isLaunchMarket(code) ? MARKETS[code] : FALLBACK_MARKET;
}

/**
 * Where a reader's country comes from, in order of trust (from locale.js):
 * their own choice, then the device location if they allowed it, then the
 * network. Only the country code is kept; coordinates are never stored.
 */
export type CountrySource = "manual" | "device" | "ip";
export interface CountryChoice {
  country: string;
  source: CountrySource;
}

const TRUST: Record<CountrySource, number> = { manual: 3, device: 2, ip: 1 };

/** Picks the most trusted country from the choices available. */
export function resolveCountry(choices: (CountryChoice | null | undefined)[]): CountryChoice | null {
  let best: CountryChoice | null = null;
  for (const c of choices) {
    if (!c || !/^[A-Za-z]{2}$/.test(c.country)) continue;
    if (!best || TRUST[c.source] > TRUST[best.source]) best = { country: c.country.toUpperCase(), source: c.source };
  }
  return best;
}

/** Money from minor units, in the market's currency and date locale. */
export function formatMoney(minor: number, market: Market = FALLBACK_MARKET): string {
  return new Intl.NumberFormat(market.dateLocale, { style: "currency", currency: market.currency.toUpperCase() }).format(minor / 100);
}

/** "30 November 2026" in the UK, "November 30, 2026" in the US. */
export function formatLongDate(date: string | Date, market: Market = FALLBACK_MARKET, timeZone?: string): string {
  return new Date(date).toLocaleDateString(market.dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: safeZone(timeZone) });
}

/** The same with a time, for security notes. */
export function formatLongDateTime(date: string | Date, market: Market = FALLBACK_MARKET, timeZone?: string): string {
  return new Date(date).toLocaleString(market.dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeZone(timeZone),
    timeZoneName: "short",
  });
}

/** A time zone the runtime knows, or UTC. */
export function safeZone(tz?: string | null): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Help now lines for a country. Wellbeing workbooks show these on every screen. */
export function helpNowFor(country: string | null | undefined): HelpLine[] {
  return marketFor(country).helpNow;
}
