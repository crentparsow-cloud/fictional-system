import type { Metadata } from "next";
import { adminAbilities } from "@/lib/admin/permissions";
import { BIO_MAX, INTRO_MAX, SLOT_LINE_MAX } from "@/lib/house-style";
import { dayWords, ukToday } from "@/lib/seasonal";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack } from "../_components/Bits";
import { deleteSlot, saveAuthorBio, saveCollectionWindow, saveSlot, saveThemeIntro } from "./actions";

export const metadata: Metadata = { title: "Editorial", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  slot_saved: { tone: "ok", text: "Slot saved." },
  slot_deleted: { tone: "ok", text: "Slot deleted." },
  slot_invalid: { tone: "error", text: "Check the slot. It needs a heading, a start and end date no more than 31 days apart, and copy without dashes, curly quotes or claim words. A title code must be a real live AK code." },
  intro_saved: { tone: "ok", text: "Theme intro saved." },
  intro_invalid: { tone: "error", text: "Check the intro. It is up to 700 characters, with no dashes, curly quotes, emoji or claim words." },
  window_saved: { tone: "ok", text: "Dates saved." },
  window_invalid: { tone: "error", text: "Check the dates. The end cannot be before the start." },
  bio_saved: { tone: "ok", text: "Bio saved and approved." },
  bio_invalid: { tone: "error", text: "Check the bio. It is in the third person, up to 700 characters, with no dashes, curly quotes or claim words." },
  denied: { tone: "error", text: "Your role cannot do that. Nothing changed." },
  invalid: { tone: "error", text: "That request was not valid. Nothing changed." },
  failed: { tone: "error", text: "The change did not save. Try again." },
};

interface SlotRow {
  id: string;
  heading: string;
  line: string;
  theme_id: string | null;
  starts_on: string;
  ends_on: string;
  status: "draft" | "live";
  workbooks: { code: string } | null;
}

/**
 * Editorial console (7.6, 7.7, 7.10, 12.5): the weekly slot on Home and
 * Explore, Theme intros, seasonal collection dates and author bios. Owners
 * and editors write; other staff read.
 */
export default async function AdminEditorialPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/editorial");
  const sp = await searchParams;
  const can = adminAbilities(staff.roles).curateCatalogue;
  const supabase = await createUserClient();
  const [slots, themes, collections, authors] = await Promise.all([
    supabase.from("editorial_slots").select("id, heading, line, theme_id, starts_on, ends_on, status, workbooks:workbook_id(code)").order("starts_on", { ascending: false }).limit(40),
    supabase.from("themes").select("id, name, intro").order("name").limit(200),
    supabase.from("collections").select("id, name, status, starts_on, ends_on").order("name").limit(200),
    supabase.from("authors").select("slug, display_name, bio").order("display_name").limit(300),
  ]);
  const slotRows = (slots.data ?? []) as unknown as SlotRow[];
  const themeRows = (themes.data ?? []) as { id: string; name: string; intro: string | null }[];
  const collectionRows = (collections.data ?? []) as { id: string; name: string; status: string; starts_on: string | null; ends_on: string | null }[];
  const authorRows = (authors.data ?? []) as { slug: string; display_name: string; bio: string | null }[];
  const code = Array.isArray(sp.notice) ? sp.notice[0] : sp.notice;
  const notice = code ? NOTICES[code] : undefined;
  const today = ukToday();

  const slotFields = (s?: SlotRow) => (
    <>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <label>
        Heading
        <input name="heading" defaultValue={s?.heading ?? ""} required maxLength={80} disabled={!can} />
      </label>
      <label>
        Line
        <textarea name="line" rows={2} maxLength={SLOT_LINE_MAX} defaultValue={s?.line ?? ""} disabled={!can} />
      </label>
      <label>
        Featured title (AK code, or blank)
        <input name="workbook_code" defaultValue={s?.workbooks?.code ?? ""} maxLength={8} disabled={!can} />
      </label>
      <label>
        Featured Theme
        <select name="theme_id" defaultValue={s?.theme_id ?? ""} disabled={!can}>
          <option value="">None</option>
          {themeRows.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Shows from
        <input name="starts_on" type="date" defaultValue={s?.starts_on ?? today} required disabled={!can} />
      </label>
      <label>
        Shows until
        <input name="ends_on" type="date" defaultValue={s?.ends_on ?? ""} required disabled={!can} />
      </label>
      <label>
        Status
        <select name="status" defaultValue={s?.status ?? "draft"} disabled={!can}>
          <option value="draft">Draft</option>
          <option value="live">Live</option>
        </select>
      </label>
    </>
  );

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Editorial</h1>
      {notice ? (
        <p className={`admin-notice admin-notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
      {!can ? <p className="muted">Only owners and editors change these. You can read them.</p> : null}

      <h2>Weekly slot</h2>
      <p className="muted">One staff pick on Home and Explore. It shows as dates, never a countdown, and only while it is live and inside its window (at most 31 days). Dates are UK dates. Today is {dayWords(today, true)}.</p>
      {slotRows.map((s) => (
        <div key={s.id} className="card">
          <form action={saveSlot} className="admin-form">
            <h3>
              {s.heading} <span className="muted">({s.status}, {dayWords(s.starts_on, true)} to {dayWords(s.ends_on, true)})</span>
            </h3>
            {slotFields(s)}
            {can ? <button className="btn" type="submit">Save slot</button> : null}
          </form>
          {can ? (
            <form action={deleteSlot}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn btn-quiet" type="submit">Delete slot</button>
            </form>
          ) : null}
        </div>
      ))}
      {can ? (
        <form action={saveSlot} className="card admin-form">
          <h3>New slot</h3>
          {slotFields()}
          <button className="btn" type="submit">Add slot</button>
        </form>
      ) : null}

      <h2>Seasonal collections</h2>
      <p className="muted">Set a start and end date to show a collection only inside that window. Leave both blank for a collection that is always shown. Readers see the dates, not a countdown.</p>
      {collectionRows.map((c) => (
        <form key={c.id} action={saveCollectionWindow} className="card admin-form">
          <input type="hidden" name="id" value={c.id} />
          <h3>
            {c.name} <span className="muted">({c.status})</span>
          </h3>
          <label>
            Shows from
            <input name="starts_on" type="date" defaultValue={c.starts_on ?? ""} disabled={!can} />
          </label>
          <label>
            Shows until
            <input name="ends_on" type="date" defaultValue={c.ends_on ?? ""} disabled={!can} />
          </label>
          {can ? <button className="btn" type="submit">Save dates</button> : null}
        </form>
      ))}

      <h2>Theme intros</h2>
      <p className="muted">A short paragraph at the top of the public Theme page. Up to {INTRO_MAX} characters.</p>
      {themeRows.map((t) => (
        <form key={t.id} action={saveThemeIntro} className="card admin-form">
          <input type="hidden" name="theme" value={t.id} />
          <label>
            {t.name}
            <textarea name="intro" rows={3} maxLength={INTRO_MAX} defaultValue={t.intro ?? ""} disabled={!can} />
          </label>
          {can ? <button className="btn" type="submit">Save intro</button> : null}
        </form>
      ))}

      <h2>Author bios</h2>
      <p className="muted">Third person, up to {BIO_MAX} characters, no dashes or curly quotes, no claim words. A bio saved here is approved at once and shows on the author page.</p>
      {authorRows.map((a) => (
        <form key={a.slug} action={saveAuthorBio} className="card admin-form">
          <input type="hidden" name="slug" value={a.slug} />
          <label>
            {a.display_name}
            <textarea name="bio" rows={4} maxLength={BIO_MAX} defaultValue={a.bio ?? ""} disabled={!can} />
          </label>
          {can ? <button className="btn" type="submit">Save bio</button> : null}
        </form>
      ))}
    </div>
  );
}
