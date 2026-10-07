import type { Metadata } from "next";
import Link from "next/link";
import { OrgSwitcher, StudioNotice } from "@/components/studio/StudioBits";
import { BookForm, type GenreOption, type ImprintOption } from "@/components/studio/BookForm";
import { roleCan, withOrg } from "@/lib/studio";
import { requireStudio } from "@/lib/studio-server";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Books", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

interface BookRow {
  id: string;
  title: string;
  subtitle: string | null;
  year: number | null;
  rights_status: string;
  is_demo: boolean;
}

/**
 * Book records (F-035). A book is kept apart from its workbooks: one book
 * can have several. Owners and editors add and edit books.
 */
export default async function BooksPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const ctx = await requireStudio("/studio/books", sp.org);
  const supabase = await createUserClient();
  const [books, genres, imprints] = await Promise.all([
    supabase.from("books").select("id, title, subtitle, year, rights_status, is_demo").eq("org_id", ctx.org.id).order("title"),
    supabase.from("genres").select("id, name").order("name"),
    supabase.from("imprints").select("id, name").eq("org_id", ctx.org.id).order("name"),
  ]);
  if (books.error) console.error("studio_books_failed", books.error.code ?? "");
  const rows = (books.data ?? []) as BookRow[];
  const can = roleCan(ctx.org.role);

  return (
    <div className="admin-page studio-page">
      <OrgSwitcher ctx={ctx} path="/studio/books" />
      <h1>Books</h1>
      <p className="muted">The books your workbooks come from. Add each book once; a book can have several workbooks.</p>
      <StudioNotice code={sp.notice} />

      {rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>No books yet</h2>
          <p className="muted">{can.writeBooks ? "Add your first book below." : "An owner or editor adds books."}</p>
        </div>
      ) : (
        <ul className="studio-list">
          {rows.map((b) => (
            <li key={b.id} className="card">
              <h2>
                <Link href={withOrg(`/studio/books/${b.id}`, ctx.org.id, ctx.multi)}>{b.title}</Link>
                {b.is_demo ? (
                  <>
                    {" "}
                    <span className="badge demo">Demo</span>
                  </>
                ) : null}
              </h2>
              {b.subtitle ? <p className="muted">{b.subtitle}</p> : null}
              {b.year ? <p className="muted small">{b.year}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {can.writeBooks ? (
        <section className="card admin-create" aria-labelledby="nb-h">
          <h2 id="nb-h">Add a book</h2>
          <BookForm
            orgId={ctx.org.id}
            genres={(genres.data ?? []) as GenreOption[]}
            imprints={(imprints.data ?? []) as ImprintOption[]}
            showPublisher={ctx.org.kind !== "individual"}
          />
        </section>
      ) : null}
    </div>
  );
}
