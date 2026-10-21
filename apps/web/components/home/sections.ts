/**
 * The marketing home (F-002) as data. Pure: no Next, React or Supabase
 * imports, so the empty library state is tested without a server.
 *
 * Copy rules: every trust point states something the code enforces today.
 * No outcome or effectiveness claims, no figures, no testimonials.
 */
import type { LibraryCard } from "@/lib/catalogue-types";
import { MEMBERSHIP_AMOUNTS, formatPrice } from "@/lib/pricing";
import { MARKETS } from "@/lib/markets";
import { TRIAL_DEFAULT_DAYS, trialLabel } from "@/lib/membership-trial";

/** Up to this many live cards show in "From the library". */
export const HOME_CARD_LIMIT = 8;

export interface HomeLink {
  href: string;
  label: string;
}

export interface TrustPoint {
  title: string;
  body: string;
}

export interface HomeStep {
  title: string;
  body: string;
}

export type LibrarySection =
  | { kind: "cards"; title: string; cards: LibraryCard[]; more: HomeLink }
  | { kind: "empty"; title: string; message: string; more: HomeLink };

export interface MembershipPlan {
  name: string;
  price: string;
  line: string;
}

export interface HomeSections {
  hero: { line: string; lead: string; note: string; primary: HomeLink; secondary: HomeLink; covers: LibraryCard[] };
  /** Shelves with a live title, as "what would you like help with" chips. */
  goals: { title: string; links: HomeLink[]; all: HomeLink };
  /** One week, as three steps plus an example exercise. */
  week: { eyebrow: string; title: string; lead: string };
  busy: { eyebrow: string; title: string; body: string; full: { figure: string; unit: string; label: string }; short: { figure: string; unit: string; label: string } };
  plan: { eyebrow: string; title: string; body: string };
  membership: { title: string; body: string; plans: MembershipPlan[]; link: HomeLink };
  authors: { title: string; links: HomeLink[] };
  finale: { title: string; body: string; link: HomeLink };
  trust: { title: string; points: TrustPoint[] };
  steps: { title: string; items: HomeStep[] };
  /** A public-domain demo title that opens with no account (5.2). */
  tryIt: { title: string; body: string; link: HomeLink };
  library: LibrarySection;
  publishers: { title: string; body: string; link: HomeLink };
  footer: { legal: HomeLink[]; other: HomeLink[]; notice: string };
}

export interface HomeInput {
  brandName: string;
  line: string;
  wellnessNotice: string;
  cards: readonly LibraryCard[];
}

/**
 * Picks the cards for the home row: real titles before demo ones, then the
 * order listLibrary gave (by title). Stable, so the row does not shuffle.
 */
export function pickHomeCards(cards: readonly LibraryCard[], limit = HOME_CARD_LIMIT): LibraryCard[] {
  const real = cards.filter((c) => !c.isDemo);
  const demo = cards.filter((c) => c.isDemo);
  return [...real, ...demo].slice(0, Math.max(0, limit));
}

/** The demo title to try signed out: Franklin's The Way to Wealth, public domain, no wellbeing content. */
export const TRY_DEMO_SLUG = "the-way-to-wealth-3tqx1";

export const LEGAL_LINKS: HomeLink[] = [
  { href: "/legal/terms", label: "Reader terms" },
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/cookies", label: "Cookie statement" },
  { href: "/legal/refunds", label: "Refund policy" },
];

export function buildHomeSections(input: HomeInput): HomeSections {
  const { brandName } = input;
  const cards = pickHomeCards(input.cards);
  const libraryLink: HomeLink = { href: "/explore", label: "See the whole library" };

  // Shelves that hold a live title, named as the library names them.
  const shelves = new Map<string, string>();
  for (const c of input.cards) if (!shelves.has(c.genreId)) shelves.set(c.genreId, c.genreName);
  const goals: HomeLink[] = [...shelves.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => ({ href: `/explore?genre=${encodeURIComponent(id)}#all`, label: name }));

  // Authors with a live title, in the order the cards come.
  const authorLinks = new Map<string, string>();
  for (const c of cards) for (const a of c.authorRefs ?? []) if (!authorLinks.has(a.slug)) authorLinks.set(a.slug, a.name);

  // The first real title that can be opened is where "Try week 1 free" goes. Otherwise the no-account demo.
  const firstOpen = cards.find((c) => !c.isDemo && c.hasVersion);
  const tryHref = firstOpen ? `/w/${firstOpen.slug}` : `/try/${TRY_DEMO_SLUG}`;
  const covers = cards.filter((c) => !c.isDemo).slice(0, 3);

  const gb = MARKETS.GB;
  const monthly = MEMBERSHIP_AMOUNTS.member_month.GBP;
  const yearly = MEMBERSHIP_AMOUNTS.member_year.GBP;
  const plans: MembershipPlan[] = [];
  if (typeof monthly === "number") plans.push({ name: "Monthly", price: formatPrice(monthly, gb), line: trialLabel("monthly", TRIAL_DEFAULT_DAYS.monthly, formatPrice(monthly, gb)) });
  if (typeof yearly === "number") plans.push({ name: "Yearly", price: formatPrice(yearly, gb), line: trialLabel("yearly", TRIAL_DEFAULT_DAYS.yearly, formatPrice(yearly, gb)) });

  const library: LibrarySection = cards.length
    ? { kind: "cards", title: "Ready to start today", cards, more: libraryLink }
    : {
        kind: "empty",
        title: "Ready to start today",
        message: "The library is being stocked. Workbooks will show here as they go live.",
        more: { href: "/publish", label: "Have a book that belongs here? Talk to us" },
      };

  return {
    hero: {
      line: input.line,
      lead: "Guided workbooks built from good books. Each week gives you one big idea, one short exercise and a page of your own to keep.",
      note: "No card needed for week 1. Your answers stay private to you.",
      primary: { href: tryHref, label: "Try week 1 free" },
      secondary: { href: "#week", label: "See how a week works" },
      covers,
    },
    goals: { title: "What would you like help with?", links: goals, all: { href: "/explore?all=1#all", label: "Show me everything" } },
    week: { eyebrow: "How it works", title: "One week looks like this", lead: "No homework pile. Just a small, steady rhythm that fits around your life." },
    busy: {
      eyebrow: "Fits a busy day",
      title: "Ten minutes is enough",
      body: "Every exercise has a short version. Do the full one when you have time. Do the short one when you do not. Both count.",
      full: { figure: "6", unit: "minutes", label: "The full exercise" },
      short: { figure: "2", unit: "minutes", label: "The short version" },
    },
    plan: {
      eyebrow: "At the end of the book",
      title: "You get a page of your own",
      body: "Your answers turn into a plan you can print or save. Put it on the fridge. Come back to it in a month. It stays yours.",
    },
    membership: {
      title: "Read more, pay less",
      body: "Membership gives you the workbooks it covers for one price. Try it before the first payment.",
      plans,
      link: { href: "/pricing", label: "See membership" },
    },
    authors: { title: "Words from writers who have lasted", links: [...authorLinks.entries()].map(([slug, name]) => ({ href: `/authors/${slug}`, label: name })) },
    finale: { title: "Week 1 is on us", body: "Pick a book and try the first week. No card, no rush.", link: { href: "/explore", label: "Choose a book" } },
    trust: {
      title: "What you can count on",
      points: [
        { title: "Private to you", body: "Everything you write in a workbook is private to you. Only you can read it." },
        { title: "No ad pixels or trackers", body: "There are no ad pixels and no third-party trackers on the site." },
        { title: "Help now, one tap away", body: "Wellbeing workbooks keep Help now one tap away, with support lines by country." },
        { title: "Demo titles are labelled", body: "Demo workbooks carry a Demo label on every card and page, and cannot be bought." },
      ],
    },
    steps: {
      title: "How it works",
      items: [
        { title: "Read", body: "One big idea, with the author's own words. About five minutes." },
        { title: "Try", body: "One short exercise. There is always a two to three minute version for busy days." },
        { title: "Keep", body: "Your answers build a page of your own. Print it, save it, use it." },
      ],
    },
    tryIt: {
      title: "Try one now, with no account",
      body: "Open the first unit of The Way to Wealth, a short public domain classic, and write your first answer. It stays on your device until you choose to sign in.",
      link: { href: `/try/${TRY_DEMO_SLUG}`, label: "Try The Way to Wealth" },
    },
    library,
    publishers: {
      title: "For authors and publishers",
      body: `${brandName} turns a published book into a guided workbook under a licence you agree. Tell us about your book and we will reply.`,
      link: { href: "/publish", label: `Publish with ${brandName}` },
    },
    footer: {
      legal: LEGAL_LINKS,
      other: [
        { href: "/help-now", label: "Help now" },
        { href: "/publish", label: `Publish with ${brandName}` },
        { href: "/help", label: "Help centre" },
        { href: "/trust", label: "Trust" },
        { href: "/pricing", label: "Pricing" },
      ],
      notice: input.wellnessNotice,
    },
  };
}
