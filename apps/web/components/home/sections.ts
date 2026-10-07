/**
 * The marketing home (F-002) as data. Pure: no Next, React or Supabase
 * imports, so the empty library state is tested without a server.
 *
 * Copy rules: every trust point states something the code enforces today.
 * No outcome or effectiveness claims, no figures, no testimonials.
 */
import type { LibraryCard } from "@/lib/catalogue-types";

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

export interface HomeSections {
  hero: { line: string; lead: string; primary: HomeLink; secondary: HomeLink };
  trust: { title: string; points: TrustPoint[] };
  steps: { title: string; items: HomeStep[] };
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

export const LEGAL_LINKS: HomeLink[] = [
  { href: "/legal/terms", label: "Reader terms" },
  { href: "/legal/privacy", label: "Privacy notice" },
  { href: "/legal/cookies", label: "Cookie statement" },
  { href: "/legal/refunds", label: "Refund policy" },
];

export function buildHomeSections(input: HomeInput): HomeSections {
  const { brandName } = input;
  const cards = pickHomeCards(input.cards);
  const libraryLink: HomeLink = { href: "/library", label: "See the whole library" };

  const library: LibrarySection = cards.length
    ? { kind: "cards", title: "From the library", cards, more: libraryLink }
    : {
        kind: "empty",
        title: "From the library",
        message: "The library is being stocked. Workbooks will show here as they go live.",
        more: { href: "/publish", label: "Have a book that belongs here? Talk to us" },
      };

  return {
    hero: {
      line: input.line,
      lead: "Guided workbooks built from published books. Read a week, try the exercises and keep your answers private.",
      primary: { href: "/library", label: "Browse the library" },
      secondary: { href: "/publish", label: `Publish with ${brandName}` },
    },
    trust: {
      title: "What you can count on",
      points: [
        { title: "Your answers are sealed", body: "Everything you write in a workbook is sealed to your account. Only you can read it." },
        { title: "No ad pixels or trackers", body: "There are no ad pixels and no third-party trackers on the site." },
        { title: "Help now, one tap away", body: "Wellbeing workbooks keep Help now one tap away, with support lines by country." },
        { title: "Demo titles are labelled", body: "Demo workbooks carry a Demo label on every card and page, and cannot be bought." },
      ],
    },
    steps: {
      title: "How it works",
      items: [
        { title: "Pick a workbook", body: "Each one is built from a single book, and the page names the book and its author." },
        { title: "Open the first week free", body: "Read the introduction, see the outline and try the first exercises before you decide." },
        { title: "Work at your own pace", body: "Come back when it suits you. Your answers stay where you left them." },
      ],
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
