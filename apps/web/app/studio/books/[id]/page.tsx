import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrivateFileUpload } from "@/components/files/PrivateFileUpload";
import { BookForm, type BookValues, type GenreOption, type ImprintOption } from "@/components/studio/BookForm";
import { LicenceDraftBanner, StudioNotice } from "@/components/studio/StudioBits";
import { formatMoney, isUuid, LICENCE_STATUS_LABELS, LICENCE_VERSION, roleCan, SUBMISSION_FILE_KINDS, SUBMISSION_ROUTES, SUBMISSION_STATUS_LABELS, withOrg } from "@/lib/studio";
import { readLicenceTextRow, requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";
import { addSubmissionFile, setContributor, withdrawSubmission } from "../../actions";

export const metadata: Metadata = { title: "Book", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const ROLE_LABELS: Record<string, string> = { author: "Author", translator: "Translator", editor: "Editor" };

/** One book (F-035) with its contributors, licence (F-036) and submissions (F-037). */
export default async function BookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const base = await requireStudio(`/studio/books/${id}`, sp.org);
  const supabase = await createUserClient();
  const { data: bookRow } = await supabase
    .from("books")
    .select("id, org_id, title, subtitle, series, series_number, edition, language, isbns, asin, publisher, imprint_id, year, genre_id, rights_status, store_links")
    .eq("id", id)
    .maybeSingle();
  if (!bookRow) notFound();
  // The book's own organisation, which the person must belong to.
  const org = base.orgs.find((o) => o.id === bookRow.org_id);
  if (!org) notFound();
  const ctx = { ...base, org };
  const can = roleCan(ctx.org.role);
  const q = (p: string) => withOrg(p, ctx.org.id, ctx.multi);

  const [rights, contributors, roster, genres, imprints, licences, submissions, files, text] = await Promise.all([
    supabase.from("book_rights").select("cover_rights_confirmed_at, kdp_select").eq("book_id", id).maybeSingle(),
    supabase.from("book_contributors").select("author_id, role, death_year, authors(display_name)").eq("book_id", id),
    supabase.rpc("studio_authors", { p_org: ctx.org.id }),
    supabase.from("genres").select("id, name").order("name"),
    supabase.from("imprints").select("id, name").eq("org_id", ctx.org.id).order("name"),
    supabase.from("licences").select("id, ref, status, method, text_version, signed_at, ends_at").eq("book_id", id).order("signed_at", { ascending: false }),
    supabase
      .from("workbook_submissions")
      .select("id, route, status, status_reason, submitted_at, quote_minor, deposit_minor, quote_currency, payment_url, workbooks(id, code, title)")
      .eq("book_id", id)
      .order("submitted_at", { ascending: false }),
    supabase.from("submission_files").select("id, submission_id, kind, file_name, storage_path, created_at").eq("org_id", ctx.org.id),
    readLicenceTextRow(LICENCE_VERSION),
  ]);

  const book: BookValues = {
    ...(bookRow as unknown as Omit<BookValues, "cover_rights" | "kdp_select">),
    cover_rights: Boolean(rights.data?.cover_rights_confirmed_at),
    kdp_select: (rights.data?.kdp_select as boolean | null | undefined) ?? null,
  };
  const contribs = (contributors.data ?? []) as unknown as { author_id: string; role: string; death_year: number | null; authors: { display_name: string } | null }[];
  const rosterRows = (roster.data ?? []) as { id: string; display_name: string }[];
  const licenceRows = (licences.data ?? []) as { id: string; ref: string; status: string; method: string; text_version: string; signed_at: string; ends_at: string | null }[];
  const subs = (submissions.data ?? []) as unknown as {
    id: string;
    route: "upload" | "develop";
    status: string;
    status_reason: string | null;
    submitted_at: string;
    quote_minor: number | null;
    deposit_minor: number | null;
    quote_currency: string | null;
    payment_url: string | null;
    workbooks: { id: string; code: string; title: string } | null;
  }[];
  const fileRows = (files.data ?? []) as { id: string; submission_id: string; kind: keyof typeof SUBMISSION_FILE_KINDS; file_name: string; storage_path: string; created_at: string }[];
  const active = licenceRows.find((l) => l.status === "active");
  const date = (s: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }).format(new Date(s));

  return (
    <div className="admin-page studio-page">
      <p className="admin-back">
        <Link href={q("/studio/books")}>All books</Link>
      </p>
      <h1>{book.title}</h1>
      <StudioNotice code={sp.notice} />

      <section className="card admin-create" aria-labelledby="lic-h">
        <h2 id="lic-h">Licence</h2>
        {text?.status === "approved" ? null : <LicenceDraftBanner />}
        {active ? (
          <p>
            Active licence <code>{active.ref}</code>, signed {date(active.signed_at)}
            {active.ends_at ? `, until ${date(active.ends_at)}` : ""}.
          </p>
        ) : (
          <p className="muted">No active licence yet. A workbook from this book cannot go live without one.</p>
        )}
        {licenceRows.filter((l) => l !== active).length > 0 ? (
          <ul className="studio-plain">
            {licenceRows
              .filter((l) => l !== active)
              .map((l) => (
                <li key={l.id}>
                  <code>{l.ref}</code> {LICENCE_STATUS_LABELS[l.status] ?? l.status}, version {l.text_version}, {date(l.signed_at)}
                </li>
              ))}
          </ul>
        ) : null}
        {can.readLicences ? (
          <p>
            <Link href={q(`/studio/books/${id}/licence`)}>{can.signLicences ? "Read and sign the licence" : "Read the licence"}</Link>
          </p>
        ) : null}
      </section>

      <section className="card admin-create" aria-labelledby="sub-h">
        <h2 id="sub-h">Workbooks and submissions</h2>
        {subs.length === 0 ? <p className="muted">Nothing submitted for this book yet.</p> : null}
        {subs.map((s) => {
          const mine = fileRows.filter((f) => f.submission_id === s.id);
          const open = !["completed", "declined", "withdrawn"].includes(s.status);
          return (
            <article key={s.id} className="studio-sub">
              <h3>
                {s.workbooks ? <Link href={q(`/studio/workbooks/${s.workbooks.id}`)}>{s.workbooks.title}</Link> : "Workbook"} {s.workbooks ? <code>{s.workbooks.code}</code> : null}
              </h3>
              <p>
                {SUBMISSION_ROUTES[s.route]?.label ?? s.route}. <strong>{SUBMISSION_STATUS_LABELS[s.status] ?? s.status}</strong>. Sent {date(s.submitted_at)}.
              </p>
              {s.status_reason ? <p className="admin-note">{s.status_reason}</p> : null}
              {s.status === "quoted" && s.quote_minor ? (
                <p>
                  Quote: {formatMoney(s.quote_minor, s.quote_currency)}
                  {s.deposit_minor ? `, with a deposit of ${formatMoney(s.deposit_minor, s.quote_currency)} to start` : ""}.{" "}
                  {s.payment_url ? (
                    <a href={s.payment_url} rel="noopener noreferrer">
                      Pay the deposit (Stripe)
                    </a>
                  ) : (
                    "We will send the payment link or an invoice."
                  )}
                </p>
              ) : null}
              {mine.length > 0 ? (
                <ul className="studio-plain">
                  {mine.map((f) => (
                    <li key={f.id}>
                      <a href={`/files/open?path=${encodeURIComponent(f.storage_path)}`}>{f.file_name}</a> <span className="muted small">{date(f.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {open && can.writeWorkbooks ? (
                <div className="studio-sub-actions">
                  <form className="admin-form" action={addSubmissionFile}>
                    <input type="hidden" name="org" value={ctx.org.id} />
                    <input type="hidden" name="book" value={id} />
                    <input type="hidden" name="submission" value={s.id} />
                    <label htmlFor={`fk-${s.id}`}>Add a file</label>
                    <select id={`fk-${s.id}`} name="file_kind" defaultValue="manuscript">
                      {Object.entries(SUBMISSION_FILE_KINDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <PrivateFileUpload orgId={ctx.org.id} kind="manuscripts" inputName="file_path" />
                    <button type="submit" className="btn secondary">
                      Add to this submission
                    </button>
                  </form>
                  <form action={withdrawSubmission}>
                    <input type="hidden" name="org" value={ctx.org.id} />
                    <input type="hidden" name="book" value={id} />
                    <input type="hidden" name="submission" value={s.id} />
                    <button type="submit" className="btn secondary">
                      Withdraw
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
        {can.writeWorkbooks ? (
          <p>
            <Link className="btn" href={q(`/studio/books/${id}/submit`)}>
              Submit a workbook for this book
            </Link>
          </p>
        ) : null}
      </section>

      <section className="card admin-create" aria-labelledby="con-h">
        <h2 id="con-h">Contributors</h2>
        {contribs.length === 0 ? <p className="muted">No contributors yet.</p> : null}
        <ul className="studio-plain">
          {contribs.map((c) => (
            <li key={`${c.author_id}-${c.role}`}>
              {c.authors?.display_name ?? "Unknown"}, {ROLE_LABELS[c.role] ?? c.role}
              {c.death_year ? ` (died ${c.death_year})` : ""}
              {can.writeBooks ? (
                <form action={setContributor} className="studio-inline">
                  <input type="hidden" name="org" value={ctx.org.id} />
                  <input type="hidden" name="book" value={id} />
                  <input type="hidden" name="author" value={c.author_id} />
                  <input type="hidden" name="role" value={c.role} />
                  <input type="hidden" name="remove" value="yes" />
                  <button type="submit" className="admin-row-btn">
                    Remove <span className="admin-vh">{c.authors?.display_name}</span>
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {can.writeBooks ? (
          <form className="admin-form" action={setContributor}>
            <input type="hidden" name="org" value={ctx.org.id} />
            <input type="hidden" name="book" value={id} />
            <label htmlFor="c-author">Person</label>
            <select id="c-author" name="author" defaultValue="">
              <option value="">Someone new (type the name below)</option>
              {rosterRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
            <label htmlFor="c-new">New name</label>
            <input id="c-new" name="new_name" maxLength={120} />
            <label htmlFor="c-role">Role</label>
            <select id="c-role" name="role" defaultValue="author">
              <option value="author">Author</option>
              <option value="translator">Translator</option>
              <option value="editor">Editor</option>
            </select>
            <label htmlFor="c-death">Year of death, if they have died</label>
            <input id="c-death" name="death_year" inputMode="numeric" maxLength={4} aria-describedby="c-death-h" />
            <p id="c-death-h" className="muted small">
              This matters for translations and older books, where rights can run out.
            </p>
            <button type="submit" className="btn secondary">
              Add contributor
            </button>
          </form>
        ) : null}
      </section>

      <section className="card admin-create" aria-labelledby="bk-h">
        <h2 id="bk-h">Book details</h2>
        <BookForm
          orgId={ctx.org.id}
          book={book}
          genres={(genres.data ?? []) as GenreOption[]}
          imprints={(imprints.data ?? []) as ImprintOption[]}
          disabled={!can.writeBooks}
          showPublisher={ctx.org.kind !== "individual"}
        />
      </section>
    </div>
  );
}
