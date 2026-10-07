import { saveBook } from "@/app/studio/actions";

export type GenreOption = { id: string; name: string };
export type ImprintOption = { id: string; name: string };

export interface BookValues {
  id: string;
  title: string;
  subtitle: string | null;
  series: string | null;
  series_number: number | null;
  edition: string | null;
  language: string;
  isbns: string[];
  asin: string | null;
  publisher: string | null;
  imprint_id: string | null;
  year: number | null;
  genre_id: string | null;
  rights_status: string;
  store_links: Record<string, string>;
  cover_rights: boolean;
  kdp_select: boolean | null;
}

/** The book record form (F-035), for a new book or an existing one. No client script. */
export function BookForm({
  orgId,
  genres,
  imprints,
  book,
  disabled = false,
  showPublisher = true,
}: {
  orgId: string;
  genres: GenreOption[];
  imprints: ImprintOption[];
  book?: BookValues;
  disabled?: boolean;
  showPublisher?: boolean;
}) {
  const id = book ? `b-${book.id.slice(0, 8)}` : "b-new";
  const kdp = book?.kdp_select === true ? "yes" : book?.kdp_select === false ? "no" : "";
  return (
    <form className="admin-form" action={saveBook}>
      <fieldset disabled={disabled}>
        <legend className="admin-vh">{book ? "Edit book" : "New book"}</legend>
        <input type="hidden" name="org" value={orgId} />
        {book ? <input type="hidden" name="book" value={book.id} /> : null}
        <label htmlFor={`${id}-title`}>Title</label>
        <input id={`${id}-title`} name="title" maxLength={300} required defaultValue={book?.title ?? ""} />
        <label htmlFor={`${id}-sub`}>Subtitle</label>
        <input id={`${id}-sub`} name="subtitle" maxLength={300} defaultValue={book?.subtitle ?? ""} />
        <label htmlFor={`${id}-series`}>Series</label>
        <input id={`${id}-series`} name="series" maxLength={200} defaultValue={book?.series ?? ""} />
        <label htmlFor={`${id}-sno`}>Number in the series</label>
        <input id={`${id}-sno`} name="series_number" inputMode="decimal" maxLength={6} defaultValue={book?.series_number ?? ""} />
        <label htmlFor={`${id}-ed`}>Edition</label>
        <input id={`${id}-ed`} name="edition" maxLength={100} placeholder="First edition" defaultValue={book?.edition ?? ""} />
        <label htmlFor={`${id}-year`}>Year published</label>
        <input id={`${id}-year`} name="year" inputMode="numeric" maxLength={4} defaultValue={book?.year ?? ""} />
        <label htmlFor={`${id}-lang`}>Language code</label>
        <input id={`${id}-lang`} name="language" maxLength={5} defaultValue={book?.language ?? "en"} />
        <label htmlFor={`${id}-genre`}>Genre</label>
        <select id={`${id}-genre`} name="genre" defaultValue={book?.genre_id ?? ""}>
          <option value="">Choose a genre</option>
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-isbn`}>ISBNs, separated by commas</label>
        <input id={`${id}-isbn`} name="isbns" maxLength={200} defaultValue={(book?.isbns ?? []).join(", ")} />
        <label htmlFor={`${id}-asin`}>ASIN (Kindle)</label>
        <input id={`${id}-asin`} name="asin" maxLength={10} defaultValue={book?.asin ?? ""} />
        {showPublisher ? (
          <>
            <label htmlFor={`${id}-pub`}>Publisher</label>
            <input id={`${id}-pub`} name="publisher" maxLength={200} defaultValue={book?.publisher ?? ""} />
            {imprints.length > 0 ? (
              <>
                <label htmlFor={`${id}-imp`}>Imprint</label>
                <select id={`${id}-imp`} name="imprint" defaultValue={book?.imprint_id ?? ""}>
                  <option value="">None</option>
                  {imprints.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : null}
        <label htmlFor={`${id}-store`}>Link to buy the book</label>
        <input id={`${id}-store`} name="store_link" type="url" maxLength={500} placeholder="https://" defaultValue={book?.store_links?.default ?? ""} />
        <label htmlFor={`${id}-rights`}>Rights</label>
        <select id={`${id}-rights`} name="rights_status" defaultValue={book?.rights_status ?? "own_work"}>
          <option value="own_work">I wrote it and hold the rights</option>
          <option value="licensed">We hold the rights under a publishing contract</option>
          <option value="public_domain">Public domain (Akana checks this)</option>
        </select>
        <fieldset className="studio-radios">
          <legend>Is the ebook enrolled in KDP Select?</legend>
          <label className="check">
            <input type="radio" name="kdp_select" value="no" defaultChecked={kdp === "no"} />
            <span>No</span>
          </label>
          <label className="check">
            <input type="radio" name="kdp_select" value="yes" defaultChecked={kdp === "yes"} />
            <span>Yes. Akana will check the workbook does not clash with KDP Select exclusivity.</span>
          </label>
        </fieldset>
        <label className="check">
          <input type="checkbox" name="cover_rights" value="yes" defaultChecked={book?.cover_rights ?? false} />
          <span>We may show the book cover. I hold the rights or have permission.</span>
        </label>
        <button type="submit" className="btn">
          {book ? "Save book" : "Add book"}
        </button>
      </fieldset>
    </form>
  );
}
