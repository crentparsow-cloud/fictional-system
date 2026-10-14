"use client";

import Link from "next/link";

/**
 * The site-wide error state (7.5, type four). One plain sentence that says
 * sorry once, one line about what is safe, and two ways forward. This is a
 * client component and cannot use the request's message set, so the words are
 * written here to match messages "error.*".
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap info-page">
      <h1>We&apos;re sorry. That could not be loaded just now.</h1>
      <p>Please try again. Your answers are safe.</p>
      <p>
        <button type="button" className="btn" onClick={() => reset()}>
          Try again
        </button>{" "}
        <Link href="/">Go to Home</Link>
      </p>
    </main>
  );
}
