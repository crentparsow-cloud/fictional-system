"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { BADGE_LABELS } from "@/lib/catalogue-guard";
import { buildSearchIndex, search, searchStatus, type SearchEntry } from "@/lib/search";

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
 * any workbook, and keeps it there when nothing else matches.
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
  empty: string;
}

export function CatalogueSearch({ entries, labels, helpHref = "/help-now", headingLevel = 2 }: { entries: SearchEntry[]; labels: SearchLabels; helpHref?: string; headingLevel?: 2 | 3 }) {
  const id = useId();
  const inputId = `${id}-q`;
  const hintId = `${id}-hint`;
  const resultsId = `${id}-results`;
  const helpHeadingId = `${id}-help`;
  const index = useMemo(() => buildSearchIndex(entries), [entries]);
  const [query, setQuery] = useState("");
  const outcome = useMemo(() => search(index, query), [index, query]);

  // The polite status waits for a pause in typing, so a screen reader is not
  // read a new count on every key.
  const status = searchStatus(outcome, labels);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(status), 450);
    return () => clearTimeout(timer);
  }, [status]);

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
              <H className="search-results-title">{labels.results}</H>
              <ul className="search-result-list">
                {outcome.results.map((r) => (
                  <li key={`${r.kind}:${r.id}`} className="search-result">
                    <Link className="search-result-link" href={r.href} prefetch={false}>
                      <span className="search-result-name">{r.title}</span>
                      {r.authors?.length ? <span className="muted small">{r.authors.join(", ")}</span> : null}
                    </Link>
                    <span className="search-result-meta small muted">
                      {r.badge ? <span className={`badge${r.badge === "demo" ? " demo" : ""}`}>{BADGE_LABELS[r.badge]}</span> : null}
                      {r.themeName ? <span>{r.themeName}</span> : null}
                      {r.code ? <span>{r.code}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted search-empty">{labels.empty}</p>
          )
        ) : null}
      </div>
    </div>
  );
}
