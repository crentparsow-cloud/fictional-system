import type { Metadata } from "next";
import Link from "next/link";
import { adminAbilities } from "@/lib/admin/permissions";
import {
  BADGE_LABELS,
  filterWorkbooks,
  killSwitchAction,
  PAUSE_REASON_MAX,
  parseWorkbookCode,
  parseWorkbookSearch,
  workbookStatusLabel,
  type WorkbookRow,
} from "@/lib/admin/workbooks";
import { getStaffSession } from "@/lib/staff";
import { createUserClient } from "@/lib/supabase/server";
import { AdminBack, labelFor } from "../_components/Bits";
import { Notice } from "../_components/Notice";
import { setWorkbookLive } from "./actions";

export const metadata: Metadata = { title: "Workbooks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const LIMIT = 500;

/**
 * Every workbook by AK code, with the kill switch (F-083). Any staff role
 * reads the list (workbooks_read lets app.is_staff see every row). Only
 * owners and editors see Pause and Resume.
 */
export default async function AdminWorkbooksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const staff = await getStaffSession("/admin/workbooks");
  const sp = await searchParams;
  const q = parseWorkbookSearch(sp.q);
  const can = adminAbilities(staff.roles);

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("workbooks")
    .select("id, code, title, status, badge, is_demo")
    .order("code", { ascending: true })
    .limit(LIMIT);
  if (error) console.error("admin_workbooks_read_failed", error.code ?? "");
  const all = (data ?? []) as WorkbookRow[];
  const rows = filterWorkbooks(all, q);

  const confirmCode = can.pauseWorkbooks ? parseWorkbookCode(Array.isArray(sp.confirm) ? sp.confirm[0] : sp.confirm) : null;
  const confirming = confirmCode ? all.find((w) => w.code === confirmCode) : undefined;
  const confirmAction = confirming ? killSwitchAction(confirming.status) : null;

  return (
    <div className="admin-page">
      <AdminBack />
      <h1>Workbooks</h1>
      <p className="muted">
        Pausing a live workbook takes it off sale and out of the public library at once. Readers who bought it keep their own answers.
      </p>
      <Notice code={sp.notice} />

      {confirming && confirmAction ? (
        <section className="card admin-confirm" aria-labelledby="confirm-h">
          <h2 id="confirm-h">{confirmAction === "pause" ? "Pause this workbook?" : "Resume this workbook?"}</h2>
          <p>
            <strong>{confirming.title}</strong> <code>{confirming.code}</code>
          </p>
          <p className="muted">
            {confirmAction === "pause"
              ? "It leaves sale and the library straight away. Nothing is deleted."
              : "It goes back on sale and into the library straight away."}
          </p>
          <form action={setWorkbookLive} className="admin-form">
            <input type="hidden" name="code" value={confirming.code} />
            <input type="hidden" name="action" value={confirmAction} />
            <label htmlFor="reason">{confirmAction === "pause" ? "Reason for the pause" : "Note (optional)"}</label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              maxLength={PAUSE_REASON_MAX}
              required={confirmAction === "pause"}
            />
            <div className="admin-actions">
              <button type="submit" className={confirmAction === "pause" ? "btn help" : "btn"}>
                {confirmAction === "pause" ? `Pause ${confirming.code}` : `Resume ${confirming.code}`}
              </button>
              <Link href={q ? `/admin/workbooks?q=${encodeURIComponent(q)}` : "/admin/workbooks"} className="btn secondary">
                Cancel
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      <form className="admin-search" role="search" action="/admin/workbooks">
        <label htmlFor="wb-q">Search by code or title</label>
        <div className="admin-search-row">
          <input id="wb-q" name="q" type="search" defaultValue={q} maxLength={100} />
          <button type="submit" className="btn secondary">
            Search
          </button>
        </div>
      </form>

      {!can.pauseWorkbooks ? <p className="admin-note">Your role can view workbooks. Only owners and editors can pause or resume.</p> : null}

      {error ? (
        <p className="admin-notice admin-notice-error" role="alert">
          Workbooks could not be loaded. Try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="card admin-empty">
          <h2>{q ? "No workbooks match" : "No workbooks yet"}</h2>
          <p className="muted">{q ? "Check the code or try part of the title." : "Workbooks will appear here once they are created."}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="admin-vh">Workbooks</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Badge</th>
                <th scope="col">Demo</th>
                {can.pauseWorkbooks ? (
                  <th scope="col">
                    <span className="admin-vh">Action</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const act = killSwitchAction(w.status);
                const href = `/admin/workbooks?${new URLSearchParams({ ...(q ? { q } : {}), confirm: w.code }).toString()}`;
                return (
                  <tr key={w.id}>
                    <td>
                      <code>{w.code}</code>
                    </td>
                    <td>{w.title}</td>
                    <td>
                      <span className={`badge admin-wb admin-wb-${w.status}`}>{workbookStatusLabel(w.status)}</span>
                    </td>
                    <td>{labelFor(BADGE_LABELS, w.badge)}</td>
                    <td>{w.is_demo ? <span className="badge demo">Demo</span> : "No"}</td>
                    {can.pauseWorkbooks ? (
                      <td>
                        {act ? (
                          <Link href={href} className={act === "pause" ? "btn help admin-row-btn" : "btn secondary admin-row-btn"}>
                            {act === "pause" ? "Pause" : "Resume"}
                            <span className="admin-vh"> {w.code}</span>
                          </Link>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
