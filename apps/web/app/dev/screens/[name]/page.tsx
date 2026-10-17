import type { Metadata } from "next";
import Link from "next/link";
import "@akana/engine/engine.css";
import { notFound } from "next/navigation";
import { ReaderNav, type NavItem } from "@/components/ReaderNav";
import { WorkbookCard } from "@/components/catalogue/WorkbookCard";
import { Rail } from "@/components/explore/Rail";
import { ShelfIcon, ShelfTile, shelfStyleVars } from "@/components/explore/ShelfTile";
import { SaveStatus } from "@/components/reader/SaveStatus";
import { UnitMap } from "@/components/reader/UnitMap";
import { requireKitPage } from "@/lib/design/kit-gate";
import { SHELF_IDS } from "@/lib/design/directions";
import type { LibraryCard } from "@/lib/catalogue-types";
import type { PathNode } from "@/lib/reading/path";
import messages from "@/messages/en-GB.json";

export const metadata: Metadata = { title: "Screens", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Reader screens built from the real components and fixture data (plan 1.8).
 * They stand in for the signed-in pages, which need a database, so the design
 * pass, the marketing screenshots and the accessibility sweep can see them.
 * Same gate as /dev/kit: staff only in production, open elsewhere. Covers come
 * from /dev/kit/cover, which needs no data.
 */
const TABS: NavItem[] = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/explore", label: "Explore", icon: "explore" },
  { href: "/my-workbooks", label: "My workbooks", icon: "workbooks" },
  { href: "/you", label: "You", icon: "you" },
];

const line = (id: string) => (messages as Record<string, string>)[`shelf.line.${id}`] ?? null;
const name = (id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function DevCover({ format, shelf, w = 96 }: { format: string; shelf: string; w?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="cover" src={`/dev/kit/cover?direction=bright-editorial&format=${format}&shelf=${shelf}&scheme=light&w=240`} width={w} height={Math.round((w * 4) / 3)} alt="" />;
}

function fixture(n: number, title: string, author: string, shelf: string, theme: string): LibraryCard {
  return {
    id: `f${n}`, code: `AK-0000${n}`, slug: `sample-${n}`, title, shortTitle: null, cardLine: "A short preview line for this workbook.",
    genreId: shelf, genreName: name(shelf), themeId: null, themeName: theme, badge: "official", isDemo: false, depth: "full",
    safetyTier: "none", authors: [author], hasVersion: true, unitCount: 4 + n * 4, unitKind: "week", freeUnits: 1,
  };
}

const CARDS = [
  fixture(0, "Budgets for Busy Households", "Wanjiru Kamau-Otieno", "money", "Considered Spending"),
  fixture(1, "Deep Mornings", "Meenakshi Iyer-Rao", "work-and-career", "Purposeful Time"),
  fixture(2, "Ubuntu at the Dinner Table", "Thandiwe Mokoena-Dube", "family-and-parenting", "Raising With Care"),
];

const NODES: PathNode[] = [
  { number: 1, focus: "Name what is happening", state: "done", stepsDone: 4, stepsTotal: 4 },
  { number: 2, focus: "One small change", state: "today", stepsDone: 1, stepsTotal: 4 },
  { number: 3, focus: "Keeping it going", state: "locked", reason: "ahead", stepsDone: 0, stepsTotal: 4 },
];

function Today() {
  return (
    <>
      <p className="muted small">Friday 9 October</p>
      <h1>Today</h1>
      <p className="muted">Three things at most. Nothing here counts days.</p>
      <div className="today-cards">
        <article className="card today-card today-with-cover">
          <DevCover format="w12" shelf="mind-and-mood" />
          <div>
            <p className="eyebrow">Carry on</p>
            <h2>Name what is happening</h2>
            <p className="muted">Rebuilding from Empty, week 1 of 12. About 8 minutes.</p>
            <Link className="btn" href="#">Open the unit</Link>
          </div>
        </article>
        <article className="card today-card">
          <p className="eyebrow">A minute, if you want it</p>
          <h2>Daily check</h2>
          <p className="muted">How is your energy today? One tap. You can skip it and nothing changes.</p>
          <div className="pips" role="group" aria-label="Energy">
            {["Low", "A bit", "Fair", "Good"].map((x) => <button key={x} type="button" className="pip">{x}</button>)}
          </div>
        </article>
        <article className="card today-card">
          <p className="eyebrow">You might like</p>
          <h2 className="wb-card-title">Deep Mornings</h2>
          <p className="muted">Meenakshi Iyer-Rao. 4 weeks. Guard one focused block each morning.</p>
        </article>
      </div>
    </>
  );
}

function Explore() {
  return (
    <>
      <h1>Explore</h1>
      <label className="search-pill"><span className="admin-vh">Search workbooks</span><input type="search" placeholder="Search workbooks" /></label>
      <h2 className="eyebrow-h">Shelves</h2>
      <ul className="shelf-tiles" role="list">
        {SHELF_IDS.map((id) => (
          <li key={id}><ShelfTile id={id} name={name(id)} line={line(id)} countLabel="12 titles" /></li>
        ))}
      </ul>
      <Rail id="start" heading="Start here" cards={CARDS.slice(0, 2)} outlineOnlyLabel="Outline only" openLabel="View" />
      <Rail id="short" heading="Short programmes" cards={CARDS.slice(1)} outlineOnlyLabel="Outline only" openLabel="View" />
    </>
  );
}

function Workbook() {
  return (
    <>
      <header className="wb-hero shelf-hero" style={shelfStyleVars("mind-and-mood")}>
        <div className="wrap wb-split">
          <DevCover format="w12" shelf="mind-and-mood" w={120} />
          <div>
            <p className="wb-crumbs"><ShelfIcon shelfId="mind-and-mood" size={18} /> Mind and Mood</p>
            <span className="badge programme">12 week programme</span>
            <h1>Rebuilding from Empty</h1>
            <p className="wb-line"><em>A Practical Guide to Burnout Recovery</em></p>
            <p className="wb-author">by <em>Maya Vaughn</em></p>
          </div>
        </div>
      </header>
      <div className="wrap wb-body">
        <h2>What you will do</h2>
        <p>One or two short exercises a week, each with a shorter version for hard days. A daily check that takes about a minute. A weekly check-in of six quick questions, or two on a hard week.</p>
        <h2>The path</h2>
        <UnitMap nodes={NODES} word="week" slug="sample" />
        <h2>Try an exercise</h2>
        <div className="card">
          <p className="wb-card-title">If you had a little more in the tank, what would you want it for? One line is enough.</p>
          <textarea className="ak-textarea" rows={2} aria-label="Your answer" placeholder="Write here. It stays private to you." />
          <SaveStatus state="saved" savedAt={null} />
        </div>
        <div className="buy-bar">
          <p className="buy-price"><strong>£11.99</strong><span className="muted small"> VAT included. Try week 1 before you pay.</span></p>
          <Link className="btn" href="#">Start week 1</Link>
        </div>
        <WorkbookCard card={CARDS[0]!} outlineOnlyLabel="Outline only" openLabel="View" />
      </div>
    </>
  );
}

const SCREENS: Record<string, () => React.JSX.Element> = { today: Today, explore: Explore, workbook: Workbook };

export default async function ScreenPage({ params }: { params: Promise<{ name: string }> }) {
  await requireKitPage();
  const { name: screen } = await params;
  const Screen = SCREENS[screen];
  if (!Screen) notFound();
  return (
    <div className="reader-shell">
      <main id="main" className={screen === "workbook" ? "reader-main" : "wrap reader-main"}>
        <Screen />
      </main>
      <ReaderNav items={TABS} label="Main" />
    </div>
  );
}
