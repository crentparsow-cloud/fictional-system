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
    <main className="wrap info-page">
      <h1>We could not find that page</h1>
      <p>The link may be old, or the page may have moved.</p>
      <p>
        <Link href="/">Go to the home page</Link> or <Link href="/help">visit the help centre</Link>.
      </p>
      <div className="info-help-row">
        <HelpNowButton />
      </div>
      <InfoFooter />
    </main>
  );
}
