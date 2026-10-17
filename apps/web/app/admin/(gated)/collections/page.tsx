import type { Metadata } from "next";
import { adminAbilities } from "@/lib/admin/permissions";
import { COVER_PATTERNS } from "@/lib/covers";
import { LINE_MAX, NAME_MAX, SHELF_LINE_MAX } from "@/lib/admin/collections";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { deleteCollection, saveCollection, saveShelfPage } from "./actions";

export const metadata: Metadata = { title: "Collections and shelves", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  line: string;
  cover_genre: string;
  cover_pattern: string | null;
  status: "draft" | "live";
  sort: number;
  collection_items: { position: number; workbooks: { code: string } | null }[];
}

/**
 * Collections (build list 2.3) and the shelf pages' editor's line and
 * featured title (2.2). Owners and editors write; other staff read. A
 * collection's titles are AK codes, one per line, in the order they show.
 * It reaches the public site only while it is live and holds at least three
 * visible titles.
 */
export default async function AdminCollectionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/collections");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles).curateCatalogue;
  const supabase = await createUserClient();
  const [collections, genres, shelves] = await Promise.all([
    supabase
      .from("collections")
      .select("id, slug, name, line, cover_genre, cover_pattern, status, sort, collection_items(position, workbooks(code))")
      .order("sort")
      .order("name")
      .limit(200),
    supabase.from("genres").select("id, name").order("name"),
    supabase.from("shelves").select("id, name, status, sort, editors_line, featured_workbook_id, workbooks:featured_workbook_id(code)").neq("status", "retired").order("sort"),
  ]);
  const rows = (collections.data ?? []) as unknown as CollectionRow[];
  const genreRows = (genres.data ?? []) as { id: string; name: string }[];
  const shelfRows = (shelves.data ?? []) as unknown as { id: string; name: string; editors_line: string | null; workbooks: { code: string } | null }[];
  const notice = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;

  const fields = (c?: CollectionRow) => (
    <>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label>
        Slug
        <input name="slug" defaultValue={c?.slug ?? ""} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} disabled={!can} />
      </label>
      <label>
        Name
        <input name="name" defaultValue={c?.name ?? ""} required maxLength={NAME_MAX} disabled={!can} />
      </label>
      <label>
        One line
        <input name="line" defaultValue={c?.line ?? ""} maxLength={LINE_MAX} disabled={!can} />
      </label>
      <label>
        Cover colours (genre)
        <select name="cover_genre" defaultValue={c?.cover_genre ?? "personal_development"} disabled={!can}>
          {genreRows.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cover pattern
        <select name="cover_pattern" defaultValue={c?.cover_pattern ?? ""} disabled={!can}>
          <option value="">Genre default</option>
          {COVER_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select name="status" defaultValue={c?.status ?? "draft"} disabled={!can}>
          <option value="draft">Draft</option>
          <option value="live">Live</option>
        </select>
      </label>
      <label>
        Order on Explore
        <input name="sort" type="number" min={0} max={9999} defaultValue={c?.sort ?? 0} disabled={!can} />
      </label>
      <label>
        Titles (AK codes, one per line, in order)
        <textarea
          name="codes"
          rows={6}
          defaultValue={c ? [...c.collection_items].sort((a, b) => a.position - b.position).map((i) => i.workbooks?.code ?? "").filter(Boolean).join("\n") : ""}
          disabled={!can}
        />
      </label>
    </>
  );

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Collections and shelves</h1>
      <Notice code={notice} />
      {!can ? <p className="muted">Only owners and editors change these. You can read them.</p> : null}

      <h2>Shelf pages</h2>
      <p className="muted">The editor&apos;s line shows at the top of the shelf page. The featured title shows only while it is live and on the shelf; otherwise the page features the title readers finish most.</p>
      {shelfRows.map((s) => (
        <form key={s.id} action={saveShelfPage} className="card admin-form">
          <input type="hidden" name="shelf" value={s.id} />
          <h3>{s.name}</h3>
          <label>
            Editor&apos;s line
            <textarea name="line" rows={2} maxLength={SHELF_LINE_MAX} defaultValue={s.editors_line ?? ""} disabled={!can} />
          </label>
          <label>
            Featured title (AK code, or blank)
            <input name="featured" defaultValue={s.workbooks?.code ?? ""} maxLength={8} disabled={!can} />
          </label>
          {can ? <button className="btn" type="submit">Save shelf page</button> : null}
        </form>
      ))}

      <h2>Collections</h2>
      {rows.map((c) => (
        <div key={c.id} className="card admin-form">
          <form action={saveCollection}>
            <h3>
              {c.name} <span className="badge">{c.status === "live" ? "Live" : "Draft"}</span>
            </h3>
            {fields(c)}
            {can ? <button className="btn" type="submit">Save collection</button> : null}
          </form>
          {can ? (
            <form action={deleteCollection}>
              <input type="hidden" name="id" value={c.id} />
              <button className="btn secondary" type="submit">Delete collection</button>
            </form>
          ) : null}
        </div>
      ))}
      {can ? (
        <form action={saveCollection} className="card admin-form">
          <h3>New collection</h3>
          {fields()}
          <button className="btn" type="submit">Create collection</button>
        </form>
      ) : null}
    </div>
  );
}
