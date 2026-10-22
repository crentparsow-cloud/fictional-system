import type { Metadata } from "next";
import Link from "next/link";
import { InfoFooter } from "@/components/InfoFooter";
import { getReaderSession } from "@/lib/auth";
import { AUTHOR_LINK_MESSAGES, AUTHOR_LINK_STATEMENTS, isAuthorLinkCode, isAuthorLinkUse } from "@/lib/author-growth";
import { brand } from "@/lib/brand";
import { createUserClient } from "@/lib/supabase/server";
import { useAuthorLink } from "./actions";

/**
 * An author's own link (6.4): /a/<code>. Names the author, says plainly that
 * the author earns a share of the membership if the reader joins through the
 * link and that it costs the reader nothing extra, and lets a signed-in
 * person choose to use it. No cookie. Not indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "An author's link",
  description: `A link from an author on ${brand.name}.`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ result?: string | string[] }> };

export default async function AuthorLinkPage({ params, searchParams }: Props) {
  const [{ code: raw }, sp, session] = await Promise.all([params, searchParams, getReaderSession()]);
  const code = raw.toLowerCase();
  const resultRaw = Array.isArray(sp.result) ? sp.result[0] : sp.result;
  const result = isAuthorLinkUse(resultRaw) ? resultRaw : null;

  let author: { name: string; slug: string } | null = null;
  if (isAuthorLinkCode(code)) {
    const supabase = await createUserClient();
    const { data } = await supabase.rpc("author_link_lookup", { p_code: code });
    const row = ((data ?? []) as { display_name: string; slug: string }[])[0];
    if (row) author = { name: row.display_name, slug: row.slug };
  }

  return (
    <main className="wrap info-page">
      <header className="info-head">
        <p className="eyebrow muted">{brand.name}</p>
        <h1>{author ? `A link from ${author.name}` : "An author's link"}</h1>
      </header>

      {!author ? <p role="status">{AUTHOR_LINK_MESSAGES.unknown_code}</p> : null}
      {result ? <p role="status">{AUTHOR_LINK_MESSAGES[result]}</p> : null}

      {author ? (
        <section aria-labelledby="author-link-terms">
          <h2 id="author-link-terms">What this link means</h2>
          <ul>
            {AUTHOR_LINK_STATEMENTS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>
            <Link href={`/authors/${author.slug}`}>See {author.name}&apos;s workbooks</Link>
          </p>
          {result === "attached" || result === "already" ? (
            <p>
              <Link className="btn" href="/pricing">
                See the membership
              </Link>
            </p>
          ) : session ? (
            <form action={useAuthorLink}>
              <input type="hidden" name="code" value={code} />
              <button type="submit" className="btn">
                Use this author&apos;s link
              </button>
            </form>
          ) : (
            <p>
              <Link className="btn" href={`/sign-in?next=${encodeURIComponent(`/a/${code}`)}`}>
                Sign in or make an account to use it
              </Link>
            </p>
          )}
        </section>
      ) : null}

      <InfoFooter />
    </main>
  );
}
