"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BADGE_LABELS } from "@/lib/catalogue-guard";
import { buildSearchIndex, groupResults, initialQueryFromSearch, queryWordHashes, search, searchStatus, type QueryHashes, type SearchEntry, type SearchGroupId } from "@/lib/search";
import { trackClientEvent } from "@/lib/track-client";

/**
 * On-device search with Help now first (F-008).
 *
 * The index arrives with the page as props and is searched in the browser.
 * What the reader types stays in this component's state: there is no form
 * submit, no URL parameter, no fetch and no analytics. Result links do not
 * prefetch, so even the set of matching pages is not requested while typing.
 * Spellcheck and autocomplete are off so the browser does not keep or send
 * the text either.
 *
 * A query that matches the crisis list shows the Help now card first, above
 * any workbook, and keeps it there when nothing else matches. That check is
 * synchronous: it runs on every keystroke and never waits for anything.
 *
 * Hidden topics arrive as short hashes (lib/search.ts). The query words are
 * hashed here with Web Crypto, which is async, so a topic match can land a
 * moment after the rest of the results. The hashes stay in this component's
 * state like the query itself.
 */
export interface SearchLabels {
  label: string;
  placeholder: string;
  privacy: string;
  countNone: string;
  countOne: string;
  /** Contains {count}. */
  count: string;
  helpFirst: string;
  helpTitle: string;
  helpBody: string;
  helpCta: string;
  results: string;
  /** Group headings for the results (2.7). */
  groupTitles: string;
  groupAuthors: string;
  groupThemes: string;
  groupCollections: string;
  empty: string;
  /** The next step shown under an empty result, a link to Explore. */
  emptyCta: string;
  /** A second step under an empty result: ask for the title (2.8). */
  requestCta: string;
}

function subscribeNever(): () => void {
  return () => undefined;
}

export function CatalogueSearch({ entries, labels, helpHref = "/help-now", headingLevel = 2 }: { entries: SearchEntry[]; labels: SearchLabels; helpHref?: string; headingLevel?: 2 | 3 }) {
  const id = useId();
  const inputId = `${id}-q`;
  const hintId = `${id}-hint`;
  const resultsId = `${id}-results`;
  const helpHeadingId = `${id}-help`;
  const index = useMemo(() => buildSearchIndex(entries), [entries]);
  // Prefill from ?q= on the address. Read in the browser only, so the server
  // never sees it and the page is the same for every reader. Once the reader
  // types, what they typed wins.
  const fromAddress = useSyncExternalStore(subscribeNever, () => initialQueryFromSearch(window.location.search), () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const query = typed ?? fromAddress;
  const setQuery = setTyped;
  // Word to hash for the latest query. Looked up by word, so while a new
  // keystroke is being hashed the words already known keep matching.
  const [hashes, setHashes] = useState<QueryHashes | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (!query.trim()) return;
    void queryWordHashes(query).then((h) => {
      if (live) setHashes(h);
    });
    return () => {
      live = false;
    };
  }, [query]);
  const outcome = useMemo(() => search(index, query, undefined, hashes), [index, query, hashes]);
  const groups = useMemo(() => groupResults(outcome.results), [outcome.results]);
  const groupLabel: Record<SearchGroupId, string> = {
    titles: labels.groupTitles,
    authors: labels.groupAuthors,
    themes: labels.groupThemes,
    collections: labels.groupCollections,
  };

  // The polite status waits for a pause in typing, so a screen reader is not
  // read a new count on every key.
  const status = searchStatus(outcome, labels);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(status), 450);
    return () => clearTimeout(timer);
  }, [status]);

  // Counted once per visit, after a pause in typing, when results came back in groups. The words typed are never sent.
  const countedGroups = useRef(false);
  useEffect(() => {
    if (countedGroups.current || !announced || groups.length === 0 || query.trim().length < 2) return;
    countedGroups.current = true;
    trackClientEvent("search_grouped_used");
  }, [announced, groups.length, query]);

  const H = headingLevel === 3 ? "h3" : "h2";

  return (
    <div className="cat-search" role="search">
      <label className="cat-search-label" htmlFor={inputId}>
        {labels.label}
      </label>
      <p id={hintId} className="muted small cat-search-hint">
        {labels.privacy}
      </p>
      <input
        id={inputId}
        className="cat-search-input"
        type="search"
        name="akana-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={labels.placeholder}
        aria-describedby={hintId}
        aria-controls={resultsId}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={200}
        data-testid="catalogue-search-input"
      />
      <p className="muted small cat-search-status" role="status" aria-live="polite" aria-atomic="true" data-testid="catalogue-search-status">
        {announced}
      </p>

      <div id={resultsId} className="cat-search-results" data-testid="catalogue-search-results">
        {outcome.helpNow ? (
          <section className="card search-help" aria-labelledby={helpHeadingId} data-testid="search-help-now">
            <H id={helpHeadingId} className="search-help-title">
              {labels.helpTitle}
            </H>
            <p>{labels.helpBody}</p>
            <Link className="btn help search-help-cta" href={helpHref} prefetch={false}>
              {labels.helpCta}
            </Link>
          </section>
        ) : null}

        {outcome.active && query.trim() ? (
          outcome.results.length ? (
            <>
              {groups.map((g) => (
                <section key={g.id} className="search-group" aria-labelledby={`${id}-g-${g.id}`} data-testid={`search-group-${g.id}`}>
                  <H id={`${id}-g-${g.id}`} className="search-results-title">
                    {groupLabel[g.id]}
                  </H>
                  <ul className="search-result-list">
                    {g.results.map((r) => (
                      <li key={`${r.kind}:${r.id}`} className="search-result">
                        <Link className="search-result-link" href={r.href} prefetch={false}>
                          <span className="search-result-name">{r.title}</span>
                          {r.authors?.length ? <span className="muted small">{r.authors.join(", ")}</span> : null}
                          {r.kind !== "workbook" && r.line ? <span className="muted small">{r.line}</span> : null}
                        </Link>
                        <span className="search-result-meta small muted">
                          {r.badge ? <span className={`badge${r.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[r.badge]}</span> : null}
                          {r.themeName ? <span>{r.themeName}</span> : null}
                          {r.code ? <span>{r.code}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          ) : (
            <div className="search-empty-block">
              <p className="muted search-empty">{labels.empty}</p>
              <Link className="btn secondary" href="/explore">
                {labels.emptyCta}
              </Link>{" "}
              <Link className="btn secondary" href="/request-title" prefetch={false}>
                {labels.requestCta}
              </Link>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
