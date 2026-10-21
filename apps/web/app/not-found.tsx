import Link from "next/link";
import { HelpNowButton } from "@/components/HelpNowButton";
import { InfoFooter } from "@/components/InfoFooter";

/**
 * The site-wide 404 page (F-144). Next.js's built-in page has no main
 * landmark, so screen reader users landed on content outside any region.
 * Help now stays one tap away, as on every public page. The root layout
 * gives the title and keeps the page noindex.
 */
export default function NotFound() {
  return (
    <main className="d-lost">
      <div className="d-lost-inner">
        <h1>That page has wandered off</h1>
        <p className="d-lead">It may have moved, or the link may be old. Try a search, or head back to the library.</p>
        <p className="d-actions">
          <Link className="btn" href="/search">
            Search the library
          </Link>
          <Link className="btn secondary" href="/library">
            Go to the library
          </Link>
        </p>
        <p>
          <Link className="d-textlink" href="/">
            Go to the home page
          </Link>{" "}
          or{" "}
          <Link className="d-textlink" href="/help">
            visit the help centre
          </Link>
          .
        </p>
        <div className="d-helprow d-helprow-center">
          <HelpNowButton />
        </div>
      </div>
      <div className="wrap">
        <InfoFooter />
      </div>
    </main>
  );
}
